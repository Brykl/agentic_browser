package config

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/Brykl/agentic_browser/cli/internal/client"
)

func TestStateLifecycle(t *testing.T) {
	ctx := context.Background()
	tmpFile := filepath.Join(t.TempDir(), "state.json")
	opts := &Options{StateFile: tmpFile}

	// Empty state before file exists
	st, err := opts.LoadState()
	if err != nil {
		t.Fatalf("LoadState() error: %v", err)
	}
	if st.BrowserID != "" || st.PageID != "" {
		t.Fatalf("expected empty state, got %+v", st)
	}

	// Resolve fails when nothing is set and BaseURL is empty
	if _, err := opts.ResolveBrowserID(ctx, ""); err == nil {
		t.Fatalf("expected error resolving empty browser ID")
	}
	if _, err := opts.ResolvePageID(ctx, "", nil); err == nil {
		t.Fatalf("expected error resolving empty page ID")
	}

	// SetActiveBrowser and SetActivePage
	if err := opts.SetActiveBrowser("b-111"); err != nil {
		t.Fatalf("SetActiveBrowser error: %v", err)
	}
	if err := opts.SetActivePage("b-111", "p-222"); err != nil {
		t.Fatalf("SetActivePage error: %v", err)
	}

	bID, err := opts.ResolveBrowserID(ctx, "")
	if err != nil || bID != "b-111" {
		t.Fatalf("expected browser ID b-111, got %q (err=%v)", bID, err)
	}
	pID, err := opts.ResolvePageID(ctx, bID, nil)
	if err != nil || pID != "p-222" {
		t.Fatalf("expected page ID p-222, got %q (err=%v)", pID, err)
	}

	// Explicit flag/arg overrides state
	if got, _ := opts.ResolveBrowserID(ctx, "b-explicit"); got != "b-explicit" {
		t.Fatalf("expected explicit browser ID, got %q", got)
	}
	if got, _ := opts.ResolvePageID(ctx, "b-explicit", []string{"p-explicit"}); got != "p-explicit" {
		t.Fatalf("expected explicit page ID, got %q", got)
	}

	// Switching browser resets page ID
	if err := opts.SetActiveBrowser("b-999"); err != nil {
		t.Fatalf("SetActiveBrowser error: %v", err)
	}
	if _, err := opts.ResolvePageID(ctx, "b-999", nil); err == nil {
		t.Fatalf("expected page ID to be cleared after switching browser")
	}

	// ClearActivePage clears only matching page
	_ = opts.SetActivePage("b-999", "p-333")
	_ = opts.ClearActivePage("p-other")
	if got, _ := opts.ResolvePageID(ctx, "b-999", nil); got != "p-333" {
		t.Fatalf("expected page ID p-333 to remain, got %q", got)
	}
	_ = opts.ClearActivePage("p-333")
	if _, err := opts.ResolvePageID(ctx, "b-999", nil); err == nil {
		t.Fatalf("expected page ID to be cleared")
	}

	// ClearActiveBrowser clears only matching browser (and its page)
	_ = opts.SetActivePage("b-999", "p-444")
	_ = opts.ClearActiveBrowser("b-other")
	if got, _ := opts.ResolveBrowserID(ctx, ""); got != "b-999" {
		t.Fatalf("expected browser ID b-999 to remain, got %q", got)
	}
	if got, _ := opts.ResolvePageID(ctx, "b-999", nil); got != "p-444" {
		t.Fatalf("expected page ID p-444 to remain, got %q", got)
	}
	_ = opts.ClearActiveBrowser("b-999")
	if _, err := opts.ResolveBrowserID(ctx, ""); err == nil {
		t.Fatalf("expected browser ID to be cleared")
	}
	if _, err := opts.ResolvePageID(ctx, "", nil); err == nil {
		t.Fatalf("expected page ID to be cleared along with browser")
	}
}

func newMockBrowsersServer(t *testing.T, browsers []client.BrowserInfo) (*httptest.Server, *atomic.Int32) {
	t.Helper()
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/api/v1/browsers" {
			calls.Add(1)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(client.ListBrowsersResponse{Browsers: browsers})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	t.Cleanup(srv.Close)
	return srv, &calls
}

func TestResolveTargetAutoSelectSingleBrowserAndPage(t *testing.T) {
	srv, calls := newMockBrowsersServer(t, []client.BrowserInfo{
		{ID: "b-only", OwnerID: "agent", PageIDs: []string{"p-only"}},
	})

	opts := &Options{
		BaseURL:   srv.URL,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
	}

	bID, pID, err := opts.ResolveTarget(context.Background(), "", nil)
	if err != nil {
		t.Fatalf("ResolveTarget error: %v", err)
	}
	if bID != "b-only" || pID != "p-only" {
		t.Fatalf("expected (b-only, p-only), got (%q, %q)", bID, pID)
	}
	if calls.Load() != 1 {
		t.Fatalf("expected 1 GET /browsers call, got %d", calls.Load())
	}

	// Auto-selected target should be persisted in state.json
	st, err := opts.LoadState()
	if err != nil {
		t.Fatalf("LoadState error: %v", err)
	}
	if st.BrowserID != "b-only" || st.PageID != "p-only" {
		t.Fatalf("expected persisted state (b-only, p-only), got %+v", st)
	}

	// Subsequent call should use persisted state without hitting the API again
	bID2, pID2, err := opts.ResolveTarget(context.Background(), "", nil)
	if err != nil {
		t.Fatalf("second ResolveTarget error: %v", err)
	}
	if bID2 != "b-only" || pID2 != "p-only" {
		t.Fatalf("expected cached (b-only, p-only), got (%q, %q)", bID2, pID2)
	}
	if calls.Load() != 1 {
		t.Fatalf("expected still 1 GET /browsers call, got %d", calls.Load())
	}
}

func TestResolveTargetAutoSelectDefaultAmongMultiple(t *testing.T) {
	srv, _ := newMockBrowsersServer(t, []client.BrowserInfo{
		{ID: "b-custom", OwnerID: "agent", PageIDs: []string{"p-custom"}},
		{ID: DefaultBrowserID, OwnerID: "system", PageIDs: []string{"p-extra", DefaultPageID}},
	})

	opts := &Options{
		BaseURL:   srv.URL,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
	}

	bID, pID, err := opts.ResolveTarget(context.Background(), "", nil)
	if err != nil {
		t.Fatalf("ResolveTarget error: %v", err)
	}
	if bID != DefaultBrowserID || pID != DefaultPageID {
		t.Fatalf("expected default (%q, %q), got (%q, %q)", DefaultBrowserID, DefaultPageID, bID, pID)
	}
}

func TestResolveTargetAutoSelectErrors(t *testing.T) {
	cases := []struct {
		name     string
		browsers []client.BrowserInfo
		wantSub  string
	}{
		{
			name:     "no browsers",
			browsers: nil,
			wantSub:  "no active browsers",
		},
		{
			name: "multiple custom browsers without default",
			browsers: []client.BrowserInfo{
				{ID: "b-1", PageIDs: []string{"p-1"}},
				{ID: "b-2", PageIDs: []string{"p-2"}},
			},
			wantSub: "multiple active browsers",
		},
		{
			name: "single browser with no pages",
			browsers: []client.BrowserInfo{
				{ID: "b-1", PageIDs: nil},
			},
			wantSub: "has no open pages",
		},
		{
			name: "single browser with multiple custom pages without default",
			browsers: []client.BrowserInfo{
				{ID: "b-1", PageIDs: []string{"p-1", "p-2"}},
			},
			wantSub: "multiple open pages",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv, _ := newMockBrowsersServer(t, tc.browsers)
			opts := &Options{
				BaseURL:   srv.URL,
				StateFile: filepath.Join(t.TempDir(), "state.json"),
			}

			_, _, err := opts.ResolveTarget(context.Background(), "", nil)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tc.wantSub)
			}
			if !strings.Contains(err.Error(), tc.wantSub) {
				t.Fatalf("expected error containing %q, got %q", tc.wantSub, err.Error())
			}
		})
	}
}

func TestResolveTargetExplicitBrowserDoesNotOverwriteState(t *testing.T) {
	srv, _ := newMockBrowsersServer(t, []client.BrowserInfo{
		{ID: "b-active", PageIDs: []string{"p-active"}},
		{ID: "b-other", PageIDs: []string{"p-other-only"}},
	})

	opts := &Options{
		BaseURL:   srv.URL,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
	}
	if err := opts.SetActivePage("b-active", "p-active"); err != nil {
		t.Fatalf("SetActivePage: %v", err)
	}

	// Passing --browser-id b-other should auto-select b-other's sole page (not p-active)
	// and must not overwrite saved state.json.
	bID, pID, err := opts.ResolveTarget(context.Background(), "b-other", nil)
	if err != nil {
		t.Fatalf("ResolveTarget error: %v", err)
	}
	if bID != "b-other" || pID != "p-other-only" {
		t.Fatalf("expected (b-other, p-other-only), got (%q, %q)", bID, pID)
	}

	st, err := opts.LoadState()
	if err != nil {
		t.Fatalf("LoadState error: %v", err)
	}
	if st.BrowserID != "b-active" || st.PageID != "p-active" {
		t.Fatalf("expected saved state untouched (b-active, p-active), got %+v", st)
	}
}

func TestResolveStrictDoesNotQueryAPI(t *testing.T) {
	srv, calls := newMockBrowsersServer(t, []client.BrowserInfo{
		{ID: DefaultBrowserID, OwnerID: "system", PageIDs: []string{DefaultPageID}},
	})

	opts := &Options{
		BaseURL:   srv.URL,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
	}

	if _, err := opts.ResolveBrowserIDStrict(""); err == nil {
		t.Fatalf("expected error from ResolveBrowserIDStrict on empty state")
	}
	if _, err := opts.ResolvePageIDStrict(DefaultBrowserID, nil); err == nil {
		t.Fatalf("expected error from ResolvePageIDStrict on empty state")
	}
	if calls.Load() != 0 {
		t.Fatalf("expected 0 API calls from strict resolvers, got %d", calls.Load())
	}
}
