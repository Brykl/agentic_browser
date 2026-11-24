package pages

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
)

func TestParseWaitTimeout(t *testing.T) {
	d, err := parseWaitTimeout("15s")
	if err != nil || d != 15*time.Second {
		t.Fatalf("expected 15s, got %v err=%v", d, err)
	}
	d, err = parseWaitTimeout("2500")
	if err != nil || d != 2500*time.Millisecond {
		t.Fatalf("expected 2500ms, got %v err=%v", d, err)
	}
	if _, err := parseWaitTimeout("50ms"); err == nil {
		t.Fatalf("expected error for timeout below 100ms")
	}
	if _, err := parseWaitTimeout("invalid"); err == nil {
		t.Fatalf("expected error for invalid timeout")
	}
}

func TestWaitCmdValidationAndRequest(t *testing.T) {
	var gotBody client.WaitPageRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/api/v1/browsers/pages/p1/wait" {
			if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
				t.Fatalf("decode wait body: %v", err)
			}
			_ = json.NewEncoder(w).Encode(client.WaitPageResponse{
				BrowserID: gotBody.BrowserID,
				PageID:    "p1",
				Waited:    true,
				ElapsedMs: 80,
				PageActionMeta: client.PageActionMeta{
					URL:       "https://example.com/done",
					Title:     "Done",
					Navigated: true,
				},
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	opts := &config.Options{
		BaseURL: srv.URL,
		Timeout: 5 * time.Second,
	}

	// Requires at least one condition
	cmdErr := newWaitCmd(opts)
	cmdErr.SetArgs([]string{"p1", "--browser-id", "b1"})
	if err := cmdErr.Execute(); err == nil {
		t.Fatalf("expected validation error when no condition is given")
	}

	// Rejects invalid --load value
	cmdBadLoad := newWaitCmd(opts)
	cmdBadLoad.SetArgs([]string{"p1", "--browser-id", "b1", "--load", "bogus"})
	if err := cmdBadLoad.Execute(); err == nil {
		t.Fatalf("expected validation error for invalid --load")
	}

	// Happy path
	var out bytes.Buffer
	cmd := newWaitCmd(opts)
	cmd.SetOut(&out)
	cmd.SetArgs([]string{"p1", "--browser-id", "b1", "--url", "/done", "--text", "Success", "--load", "networkidle", "--timeout", "15s", "--diff"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if gotBody.URL != "/done" || gotBody.Text != "Success" || gotBody.Load != "networkidle" || gotBody.Timeout != 15000 || gotBody.Snapshot != "diff" {
		t.Fatalf("unexpected request payload: %+v", gotBody)
	}
	if !strings.Contains(out.String(), "Waited 80ms on page p1") || !strings.Contains(out.String(), "https://example.com/done (navigated)") {
		t.Fatalf("unexpected output: %s", out.String())
	}
}
