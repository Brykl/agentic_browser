package pages

import (
	"fmt"
	"io"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
)

type snapshotFlags struct {
	compact bool
	diff    bool
	full    bool
}

func (f *snapshotFlags) bind(cmd *cobra.Command) {
	cmd.Flags().BoolVar(&f.compact, "snapshot", false, "Include compact accessibility snapshot after the action")
	cmd.Flags().BoolVar(&f.diff, "diff", false, "Include line-level diff against the previous snapshot after the action")
	cmd.Flags().BoolVar(&f.full, "full-snapshot", false, "Include full uncompacted accessibility snapshot after the action")
}

func (f *snapshotFlags) mode() (string, error) {
	count := 0
	if f.compact {
		count++
	}
	if f.diff {
		count++
	}
	if f.full {
		count++
	}
	if count > 1 {
		return "", fmt.Errorf("flags --snapshot, --diff, and --full-snapshot are mutually exclusive")
	}
	switch {
	case f.compact:
		return "compact", nil
	case f.diff:
		return "diff", nil
	case f.full:
		return "full", nil
	default:
		return "", nil
	}
}

func printActionMeta(out io.Writer, meta client.PageActionMeta) error {
	if meta.URL != "" {
		suffix := ""
		if meta.Navigated {
			suffix = " (navigated)"
		}
		if _, err := fmt.Fprintf(out, "URL: %s%s\n", meta.URL, suffix); err != nil {
			return err
		}
	}
	if meta.Title != "" {
		if _, err := fmt.Fprintf(out, "Title: %s\n", meta.Title); err != nil {
			return err
		}
	}
	return printActionSnapshot(out, meta.Snapshot, meta.SnapshotMode)
}

func printActionSnapshot(out io.Writer, snapshot, mode string) error {
	if snapshot == "" {
		return nil
	}
	if mode == "" {
		mode = "compact"
	}
	if _, err := fmt.Fprintf(out, "--- snapshot (%s) ---\n", mode); err != nil {
		return err
	}
	if strings.HasSuffix(snapshot, "\n") {
		_, err := fmt.Fprint(out, snapshot)
		return err
	}
	_, err := fmt.Fprintln(out, snapshot)
	return err
}
