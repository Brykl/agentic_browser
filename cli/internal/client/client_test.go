package client_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Brykl/agentic_browser/cli/internal/client"
)

func TestClientBrowsersAndPages(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/browsers":
			_ = json.NewEncoder(w).Encode(client.ListBrowsersResponse{
				Browsers: []client.BrowserInfo{
					{ID: "b1", Engine: "puppeteer", OwnerID: "u1", LastUsed: 1000, PageIDs: []string{"p1"}},
				},
			})

		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/browsers":
			var body client.CreateBrowserRequest
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode create browser: %v", err)
			}
			if body.Engine != "camoufox" {
				t.Fatalf("expected engine=camoufox, got %q", body.Engine)
			}
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(client.CreateBrowserResponse{BrowserID: "b2"})

		case r.Method == http.MethodDelete && r.URL.Path == "/api/v1/browsers/b2":
			_ = json.NewEncoder(w).Encode(client.DeleteBrowserResponse{
				BrowserID: "b2",
				Deleted:   true,
			})

		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/browsers/pages":
			if r.URL.Query().Get("browserId") != "b1" {
				w.WriteHeader(http.StatusNotFound)
				_ = json.NewEncoder(w).Encode(map[string]string{"error": "Browser not found"})
				return
			}
			_ = json.NewEncoder(w).Encode(client.ListPagesResponse{
				BrowserID: "b1",
				Pages:     []client.PageSummary{{PageID: "p1", URL: "https://example.com"}},
			})

		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/browsers/pages":
			w.WriteHeader(http.StatusCreated)
			_, _ = w.Write([]byte(`Successfully created page with id:"p-new"`))

		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/browsers/pages/p1":
			_ = json.NewEncoder(w).Encode(client.PageDetail{
				BrowserID: r.URL.Query().Get("browserId"),
				PageID:    "p1",
				URL:       "https://example.com",
				Title:     "Example",
			})

		case r.Method == http.MethodPatch && r.URL.Path == "/api/v1/browsers/pages/p1":
			_ = json.NewEncoder(w).Encode(client.PageDetail{
				BrowserID: "b1",
				PageID:    "p1",
				URL:       "https://example.org",
				Title:     "Updated",
			})

		case r.Method == http.MethodDelete && r.URL.Path == "/api/v1/browsers/pages/p1":
			_ = json.NewEncoder(w).Encode(client.DeletePageResponse{
				BrowserID: "b1",
				PageID:    "p1",
				Deleted:   true,
			})

		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/browsers/pages/p1/snapshot":
			snap := "[ref=e1] button \"Submit\""
			if r.URL.Query().Get("full") == "true" {
				snap = "- generic [ref=e1]:\n  - button \"Submit\" [ref=e2]"
			}
			_ = json.NewEncoder(w).Encode(client.PageSnapshotResponse{
				BrowserID: "b1",
				PageID:    "p1",
				Snapshot:  snap,
			})

		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/browsers/pages/p1/click":
			_ = json.NewEncoder(w).Encode(client.ClickPageResponse{
				BrowserID: "b1",
				PageID:    "p1",
				Clicked:   true,
				Ref:       "e1",
				X:         12.5,
				Y:         34.5,
			})

		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/browsers/pages/p1/fill":
			var body struct {
				BrowserID string             `json:"browserId"`
				Ref       string             `json:"ref"`
				Value     string             `json:"value"`
				Fields    []client.FillField `json:"fields"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode fill page: %v", err)
			}
			if len(body.Fields) > 0 {
				if body.Fields[0].Ref == "bad" {
					w.WriteHeader(http.StatusBadRequest)
					_ = json.NewEncoder(w).Encode(map[string]any{
						"error":     "Ref [bad] not found",
						"failedRef": "bad",
						"completed": []client.FillFieldResult{},
					})
					return
				}
				results := make([]client.FillFieldResult, 0, len(body.Fields))
				for _, f := range body.Fields {
					results = append(results, client.FillFieldResult{
						Filled: true,
						Ref:    f.Ref,
						Value:  f.Value,
					})
				}
				_ = json.NewEncoder(w).Encode(client.FillFieldsResponse{
					BrowserID: body.BrowserID,
					PageID:    "p1",
					Filled:    true,
					Results:   results,
				})
				return
			}
			_ = json.NewEncoder(w).Encode(client.FillPageResponse{
				BrowserID: body.BrowserID,
				PageID:    "p1",
				Filled:    true,
				Ref:       body.Ref,
				Value:     body.Value,
			})

		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/browsers/pages/p1/reload":
			var body client.ReloadPageRequest
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode reload page: %v", err)
			}
			_ = json.NewEncoder(w).Encode(client.ReloadPageResponse{
				BrowserID: body.BrowserID,
				PageID:    "p1",
				Reloaded:  true,
			})

		case r.Method == http.MethodGet && r.URL.Path == "/api/v1/browsers/pages/p1/scroll":
			_ = json.NewEncoder(w).Encode(client.PageScrollInfoResponse{
				BrowserID: "b1",
				PageID:    "p1",
				X:         0,
				Y:         120,
				MaxX:      0,
				MaxY:      800,
			})

		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/browsers/pages/p1/scroll":
			var body client.ScrollPageRequest
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode scroll page: %v", err)
			}
			_ = json.NewEncoder(w).Encode(client.ScrollPageResponse{
				BrowserID: body.BrowserID,
				PageID:    "p1",
				X:         body.Left,
				Y:         body.Top,
			})

		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	c := client.New(srv.URL)
	ctx := context.Background()

	browsersRes, err := c.ListBrowsers(ctx)
	if err != nil || len(browsersRes.Browsers) != 1 || browsersRes.Browsers[0].ID != "b1" {
		t.Fatalf("ListBrowsers unexpected: res=%+v err=%v", browsersRes, err)
	}

	headless := true
	createBrowserRes, err := c.CreateBrowser(ctx, client.CreateBrowserRequest{OwnerID: "u1", Headless: &headless, Engine: "camoufox"})
	if err != nil || createBrowserRes.BrowserID != "b2" {
		t.Fatalf("CreateBrowser unexpected: res=%+v err=%v", createBrowserRes, err)
	}

	delBrowserRes, err := c.DeleteBrowser(ctx, "b2")
	if err != nil || !delBrowserRes.Deleted || delBrowserRes.BrowserID != "b2" {
		t.Fatalf("DeleteBrowser unexpected: res=%+v err=%v", delBrowserRes, err)
	}

	pagesRes, err := c.ListPages(ctx, "b1")
	if err != nil || len(pagesRes.Pages) != 1 || pagesRes.Pages[0].PageID != "p1" {
		t.Fatalf("ListPages unexpected: res=%+v err=%v", pagesRes, err)
	}

	_, err = c.ListPages(ctx, "missing")
	var apiErr *client.APIError
	if !errors.As(err, &apiErr) || apiErr.StatusCode != http.StatusNotFound || apiErr.Message != "Browser not found" {
		t.Fatalf("expected 404 APIError, got: %v", err)
	}

	createPageRes, err := c.CreatePage(ctx, client.CreatePageRequest{BrowserID: "b1", PageURL: "https://example.com"})
	if err != nil || createPageRes.PageID != "p-new" {
		t.Fatalf("CreatePage unexpected: res=%+v err=%v", createPageRes, err)
	}

	getPageRes, err := c.GetPage(ctx, "b1", "p1")
	if err != nil || getPageRes.Title != "Example" {
		t.Fatalf("GetPage unexpected: res=%+v err=%v", getPageRes, err)
	}

	updatePageRes, err := c.UpdatePage(ctx, "p1", client.UpdatePageRequest{BrowserID: "b1", PageURL: "https://example.org"})
	if err != nil || updatePageRes.URL != "https://example.org" {
		t.Fatalf("UpdatePage unexpected: res=%+v err=%v", updatePageRes, err)
	}

	delRes, err := c.DeletePage(ctx, "b1", "p1")
	if err != nil || !delRes.Deleted {
		t.Fatalf("DeletePage unexpected: res=%+v err=%v", delRes, err)
	}

	snapRes, err := c.SnapshotPage(ctx, "b1", "p1", false)
	if err != nil || snapRes.Snapshot != "[ref=e1] button \"Submit\"" {
		t.Fatalf("SnapshotPage unexpected: res=%+v err=%v", snapRes, err)
	}

	fullSnapRes, err := c.SnapshotPage(ctx, "b1", "p1", true)
	if err != nil || fullSnapRes.Snapshot != "- generic [ref=e1]:\n  - button \"Submit\" [ref=e2]" {
		t.Fatalf("SnapshotPage(full=true) unexpected: res=%+v err=%v", fullSnapRes, err)
	}

	clickRes, err := c.ClickPage(ctx, "p1", client.ClickPageRequest{BrowserID: "b1", Ref: "e1"})
	if err != nil || !clickRes.Clicked || clickRes.Ref != "e1" {
		t.Fatalf("ClickPage unexpected: res=%+v err=%v", clickRes, err)
	}

	fillRes, err := c.FillPage(ctx, "p1", client.FillPageRequest{BrowserID: "b1", Ref: "e2", Value: "hello"})
	if err != nil || !fillRes.Filled || fillRes.Ref != "e2" || fillRes.Value != "hello" {
		t.Fatalf("FillPage unexpected: res=%+v err=%v", fillRes, err)
	}

	fillBatchRes, err := c.FillPageFields(ctx, "p1", client.FillFieldsRequest{
		BrowserID: "b1",
		Fields: []client.FillField{
			{Ref: "e8", Value: "user@example.com"},
			{Ref: "e9", Value: "secret=123"},
		},
	})
	if err != nil || !fillBatchRes.Filled || len(fillBatchRes.Results) != 2 || fillBatchRes.Results[1].Value != "secret=123" {
		t.Fatalf("FillPageFields unexpected: res=%+v err=%v", fillBatchRes, err)
	}

	_, err = c.FillPageFields(ctx, "p1", client.FillFieldsRequest{
		BrowserID: "b1",
		Fields:    []client.FillField{{Ref: "bad", Value: "x"}},
	})
	if !errors.As(err, &apiErr) || apiErr.StatusCode != http.StatusBadRequest || apiErr.Message != "Ref [bad] not found (failedRef: bad, completed: 0)" {
		t.Fatalf("expected 400 batch APIError, got: %v", err)
	}

	reloadRes, err := c.ReloadPage(ctx, "b1", "p1")
	if err != nil || !reloadRes.Reloaded || reloadRes.PageID != "p1" {
		t.Fatalf("ReloadPage unexpected: res=%+v err=%v", reloadRes, err)
	}

	scrollInfoRes, err := c.GetPageScroll(ctx, "b1", "p1")
	if err != nil || scrollInfoRes.Y != 120 || scrollInfoRes.MaxY != 800 {
		t.Fatalf("GetPageScroll unexpected: res=%+v err=%v", scrollInfoRes, err)
	}

	scrollRes, err := c.ScrollPage(ctx, "p1", client.ScrollPageRequest{BrowserID: "b1", Left: 10, Top: 250})
	if err != nil || scrollRes.X != 10 || scrollRes.Y != 250 {
		t.Fatalf("ScrollPage unexpected: res=%+v err=%v", scrollRes, err)
	}
}
