package pages

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

const defaultWaitTimeout = 10 * time.Second

func parseWaitTimeout(raw string) (time.Duration, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return defaultWaitTimeout, nil
	}
	if ms, err := strconv.Atoi(trimmed); err == nil {
		if ms < 100 || ms > 120000 {
			return 0, fmt.Errorf("--timeout must be between 100ms and 120s")
		}
		return time.Duration(ms) * time.Millisecond, nil
	}
	d, err := time.ParseDuration(trimmed)
	if err != nil {
		return 0, fmt.Errorf("invalid --timeout %q (use duration like 10s, 500ms, or milliseconds like 5000)", raw)
	}
	if d < 100*time.Millisecond || d > 120*time.Second {
		return 0, fmt.Errorf("--timeout must be between 100ms and 120s")
	}
	return d, nil
}

func validateLoadState(load string) error {
	switch load {
	case "", "domcontentloaded", "load", "networkidle":
		return nil
	default:
		return fmt.Errorf("invalid --load %q: must be one of domcontentloaded, load, networkidle", load)
	}
}

func newWaitCmd(opts *config.Options) *cobra.Command {
	var (
		browserID  string
		urlPattern string
		text       string
		loadState  string
		timeoutRaw string
		snap       snapshotFlags
	)

	cmd := &cobra.Command{
		Use:   "wait [page-id]",
		Short: "Wait for a URL, visible text, or load state on a page",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			urlPattern = strings.TrimSpace(urlPattern)
			text = strings.TrimSpace(text)
			loadState = strings.TrimSpace(loadState)

			if urlPattern == "" && text == "" && loadState == "" {
				return fmt.Errorf("at least one of --url, --text, or --load must be specified")
			}
			if err := validateLoadState(loadState); err != nil {
				return err
			}
			waitTimeout, err := parseWaitTimeout(timeoutRaw)
			if err != nil {
				return err
			}
			snapshotMode, err := snap.mode()
			if err != nil {
				return err
			}

			resolvedBrowserID, resolvedPageID, err := opts.ResolveTarget(cmd.Context(), browserID, args)
			if err != nil {
				return err
			}

			httpTimeout := opts.Timeout
			if needed := waitTimeout + 5*time.Second; needed > httpTimeout {
				httpTimeout = needed
			}
			apiClient := client.New(opts.BaseURL, client.WithTimeout(httpTimeout))

			res, err := apiClient.WaitPage(cmd.Context(), resolvedPageID, client.WaitPageRequest{
				BrowserID: resolvedBrowserID,
				URL:       urlPattern,
				Text:      text,
				Load:      loadState,
				Timeout:   int(waitTimeout / time.Millisecond),
				Snapshot:  snapshotMode,
			})
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			if _, err := fmt.Fprintf(out, "Waited %dms on page %s\n", res.ElapsedMs, res.PageID); err != nil {
				return err
			}
			return printActionMeta(out, res.PageActionMeta)
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")
	cmd.Flags().StringVar(&urlPattern, "url", "", "Wait until page URL matches substring, glob (*), or /regex/")
	cmd.Flags().StringVar(&text, "text", "", "Wait until visible text appears on the page")
	cmd.Flags().StringVar(&loadState, "load", "", "Wait for load state: domcontentloaded, load, or networkidle")
	cmd.Flags().StringVar(&timeoutRaw, "timeout", "10s", "Maximum wait duration (e.g. 10s, 500ms, or milliseconds like 5000)")
	snap.bind(cmd)

	return cmd
}
