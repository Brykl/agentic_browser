package pages

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
)

func TestParseFillFields(t *testing.T) {
	fields, err := parseFillFields(
		[]string{"e8=user@example.com", "e9=a=b,c", "e10="},
		`[{"ref":"e1","value":"line1\nline2"}]`,
	)
	if err != nil {
		t.Fatalf("parseFillFields unexpected error: %v", err)
	}
	if len(fields) != 4 {
		t.Fatalf("expected 4 fields, got %d: %+v", len(fields), fields)
	}
	if fields[0].Ref != "e1" || fields[0].Value != "line1\nline2" {
		t.Fatalf("unexpected fields[0]: %+v", fields[0])
	}
	if fields[2].Ref != "e9" || fields[2].Value != "a=b,c" {
		t.Fatalf("unexpected fields[2]: %+v", fields[2])
	}
	if fields[3].Ref != "e10" || fields[3].Value != "" {
		t.Fatalf("unexpected fields[3]: %+v", fields[3])
	}

	if _, err := parseFillFields([]string{"missing-equals"}, ""); err == nil {
		t.Fatalf("expected error for missing '='")
	}
	if _, err := parseFillFields([]string{"=val"}, ""); err == nil {
		t.Fatalf("expected error for empty ref")
	}
	if _, err := parseFillFields(nil, `[{"ref":"","value":"x"}]`); err == nil {
		t.Fatalf("expected error for empty ref in JSON")
	}
}

func TestFillCmdBatchAndSingle(t *testing.T) {
	var lastBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/browsers/pages/p1/fill" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		lastBody = nil
		if err := json.NewDecoder(r.Body).Decode(&lastBody); err != nil {
			t.Fatalf("decode body: %v", err)
		}
		if rawFields, ok := lastBody["fields"].([]any); ok {
			results := make([]client.FillFieldResult, 0, len(rawFields))
			for _, item := range rawFields {
				m := item.(map[string]any)
				results = append(results, client.FillFieldResult{
					Filled: true,
					Ref:    m["ref"].(string),
					Value:  m["value"].(string),
				})
			}
			_ = json.NewEncoder(w).Encode(client.FillFieldsResponse{
				BrowserID: "b1",
				PageID:    "p1",
				Filled:    true,
				Results:   results,
			})
			return
		}
		_ = json.NewEncoder(w).Encode(client.FillPageResponse{
			BrowserID: "b1",
			PageID:    "p1",
			Filled:    true,
			Ref:       lastBody["ref"].(string),
			Value:     lastBody["value"].(string),
		})
	}))
	defer srv.Close()

	newOpts := func() *config.Options {
		return &config.Options{
			BaseURL:   srv.URL,
			StateFile: t.TempDir() + "/state.json",
		}
	}

	// 1. Batch via repeated -f (preserving commas and '=')
	{
		var out bytes.Buffer
		cmd := newFillCmd(newOpts())
		cmd.SetOut(&out)
		cmd.SetErr(&out)
		cmd.SetArgs([]string{"--browser-id", "b1", "p1", "-f", "e8=hello, world", "-f", "e9=k=v"})
		if err := cmd.Execute(); err != nil {
			t.Fatalf("batch fill failed: %v", err)
		}
		if _, hasRef := lastBody["ref"]; hasRef {
			t.Fatalf("batch request must not include 'ref': %+v", lastBody)
		}
		if !strings.Contains(out.String(), "Filled 2 fields:") || !strings.Contains(out.String(), `[e8] = "hello, world"`) {
			t.Fatalf("unexpected batch output: %q", out.String())
		}
	}

	// 2. Single mode with empty value (clearing a field)
	{
		var out bytes.Buffer
		cmd := newFillCmd(newOpts())
		cmd.SetOut(&out)
		cmd.SetErr(&out)
		cmd.SetArgs([]string{"--browser-id", "b1", "p1", "--ref", "e8", "--value", ""})
		if err := cmd.Execute(); err != nil {
			t.Fatalf("single fill failed: %v", err)
		}
		if _, hasFields := lastBody["fields"]; hasFields {
			t.Fatalf("single request must not include 'fields': %+v", lastBody)
		}
		if lastBody["value"] != "" {
			t.Fatalf("expected empty value in request, got %+v", lastBody)
		}
	}

	// 3. Reject mixing --ref and -f
	{
		var out bytes.Buffer
		cmd := newFillCmd(newOpts())
		cmd.SetOut(&out)
		cmd.SetErr(&out)
		cmd.SetArgs([]string{"--browser-id", "b1", "p1", "--ref", "e8", "--value", "x", "-f", "e9=y"})
		if err := cmd.Execute(); err == nil {
			t.Fatalf("expected error when mixing --ref and -f")
		}
	}
}
