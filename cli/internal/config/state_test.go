package config

import (
	"path/filepath"
	"testing"
)

func TestStateLifecycle(t *testing.T) {
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

	// Resolve fails when nothing is set
	if _, err := opts.ResolveBrowserID(""); err == nil {
		t.Fatalf("expected error resolving empty browser ID")
	}
	if _, err := opts.ResolvePageID(nil); err == nil {
		t.Fatalf("expected error resolving empty page ID")
	}

	// SetActiveBrowser and SetActivePage
	if err := opts.SetActiveBrowser("b-111"); err != nil {
		t.Fatalf("SetActiveBrowser error: %v", err)
	}
	if err := opts.SetActivePage("b-111", "p-222"); err != nil {
		t.Fatalf("SetActivePage error: %v", err)
	}

	bID, err := opts.ResolveBrowserID("")
	if err != nil || bID != "b-111" {
		t.Fatalf("expected browser ID b-111, got %q (err=%v)", bID, err)
	}
	pID, err := opts.ResolvePageID(nil)
	if err != nil || pID != "p-222" {
		t.Fatalf("expected page ID p-222, got %q (err=%v)", pID, err)
	}

	// Explicit flag/arg overrides state
	if got, _ := opts.ResolveBrowserID("b-explicit"); got != "b-explicit" {
		t.Fatalf("expected explicit browser ID, got %q", got)
	}
	if got, _ := opts.ResolvePageID([]string{"p-explicit"}); got != "p-explicit" {
		t.Fatalf("expected explicit page ID, got %q", got)
	}

	// Switching browser resets page ID
	if err := opts.SetActiveBrowser("b-999"); err != nil {
		t.Fatalf("SetActiveBrowser error: %v", err)
	}
	if _, err := opts.ResolvePageID(nil); err == nil {
		t.Fatalf("expected page ID to be cleared after switching browser")
	}

	// ClearActivePage clears only matching page
	_ = opts.SetActivePage("b-999", "p-333")
	_ = opts.ClearActivePage("p-other")
	if got, _ := opts.ResolvePageID(nil); got != "p-333" {
		t.Fatalf("expected page ID p-333 to remain, got %q", got)
	}
	_ = opts.ClearActivePage("p-333")
	if _, err := opts.ResolvePageID(nil); err == nil {
		t.Fatalf("expected page ID to be cleared")
	}
}
