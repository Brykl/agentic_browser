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

func TestCreateBrowserCmdHumanizeFlag(t *testing.T) {
	var payloads []map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/api/v1/browsers" {
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Errorf("decode body: %v", err)
			}
			payloads = append(payloads, body)
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(client.CreateBrowserResponse{
				BrowserID: "b-new",
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	run := func(args ...string) {
		t.Helper()
		opts := &config.Options{
			BaseURL:   srv.URL,
			StateFile: filepath.Join(t.TempDir(), "state.json"),
		}
		cmd := NewCmd(opts)
		var out bytes.Buffer
		cmd.SetOut(&out)
		cmd.SetArgs(args)
		if err := cmd.Execute(); err != nil {
			t.Fatalf("execute %v: %v", args, err)
		}
	}

	// 1. Flag omitted -> humanize not sent (server applies env default).
	run("create", "--owner-id", "agent")
	// 2. Flag enabled -> humanize: true.
	run("create", "--owner-id", "agent", "--humanize")
	// 3. Flag explicitly disabled -> humanize: false.
	run("create", "--owner-id", "agent", "--humanize=false")

	if len(payloads) != 3 {
		t.Fatalf("expected 3 requests, got %d", len(payloads))
	}

	if _, exists := payloads[0]["humanize"]; exists {
		t.Fatalf("expected humanize to be omitted when flag is unset, got %v", payloads[0])
	}
	if v, ok := payloads[1]["humanize"].(bool); !ok || !v {
		t.Fatalf("expected humanize=true when --humanize is set, got %v", payloads[1])
	}
	if v, ok := payloads[2]["humanize"].(bool); !ok || v {
		t.Fatalf("expected humanize=false when --humanize=false is set, got %v", payloads[2])
	}
}

func TestListBrowsersCmdShowsHumanize(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/api/v1/browsers" {
			_ = json.NewEncoder(w).Encode(client.ListBrowsersResponse{
				Browsers: []client.BrowserInfo{
					{
						ID:       "b-1",
						Engine:   "camoufox",
						Humanize: true,
						OwnerID:  "agent",
						LastUsed: 1700000000000,
						PageIDs:  []string{"p-1"},
					},
				},
			})
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	opts := &config.Options{
		BaseURL:   srv.URL,
		StateFile: filepath.Join(t.TempDir(), "state.json"),
	}
	cmd := NewCmd(opts)
	var out bytes.Buffer
	cmd.SetOut(&out)
	cmd.SetArgs([]string{"list"})
	if err := cmd.Execute(); err != nil {
		t.Fatalf("list failed: %v", err)
	}

	got := out.String()
	if !strings.Contains(got, "HUMANIZE") || !strings.Contains(got, "true") {
		t.Fatalf("expected HUMANIZE column and true value in output, got:\n%s", got)
	}
}
