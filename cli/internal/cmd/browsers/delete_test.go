package browsers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
)

func TestDeleteBrowserCmdStateReset(t *testing.T) {
	var deletedIDs []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete && strings.HasPrefix(r.URL.Path, "/api/v1/browsers/") {
			id := strings.TrimPrefix(r.URL.Path, "/api/v1/browsers/")
			deletedIDs = append(deletedIDs, id)
			_ = json.NewEncoder(w).Encode(client.DeleteBrowserResponse{
				BrowserID: id,
				Deleted:   true,
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	stateFile := filepath.Join(t.TempDir(), "state.json")
	opts := &config.Options{
		BaseURL:   srv.URL,
		StateFile: stateFile,
	}

	if err := opts.SetActivePage("b-active", "p-active"); err != nil {
		t.Fatalf("SetActivePage: %v", err)
	}

	// Deleting a different browser preserves active state.
	cmd := NewCmd(opts)
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetArgs([]string{"delete", "b-other"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("delete other browser failed: %v", err)
	}

	st, err := opts.LoadState()
	if err != nil {
		t.Fatalf("LoadState: %v", err)
	}
	if st.BrowserID != "b-active" || st.PageID != "p-active" {
		t.Fatalf("expected active state preserved, got %+v", st)
	}

	// Deleting the active browser resets state.json.
	cmd = NewCmd(opts)
	out.Reset()
	cmd.SetOut(&out)
	cmd.SetArgs([]string{"delete", "b-active"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("delete active browser failed: %v", err)
	}

	st, err = opts.LoadState()
	if err != nil {
		t.Fatalf("LoadState: %v", err)
	}
	if st.BrowserID != "" || st.PageID != "" {
		t.Fatalf("expected state cleared, got %+v", st)
	}

	if len(deletedIDs) != 2 || deletedIDs[0] != "b-other" || deletedIDs[1] != "b-active" {
		t.Fatalf("unexpected deletedIDs: %v", deletedIDs)
	}
}
