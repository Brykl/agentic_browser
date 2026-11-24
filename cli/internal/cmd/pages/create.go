package pages

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newCreateCmd(opts *config.Options) *cobra.Command {
	var (
		browserID string
		pageURL   string
		snap      snapshotFlags
	)

	cmd := &cobra.Command{
		Use:   "create",
		Short: "Open a new page in a browser session",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			snapshotMode, err := snap.mode()
			if err != nil {
				return err
			}

			resolvedBrowserID, err := opts.ResolveBrowserID(cmd.Context(), browserID)
			if err != nil {
				return err
			}

			res, err := opts.NewClient().CreatePage(cmd.Context(), client.CreatePageRequest{
				BrowserID: resolvedBrowserID,
				PageURL:   pageURL,
				Snapshot:  snapshotMode,
			})
			if err != nil {
				return err
			}

			if res.PageID != "" {
				_ = opts.SetActivePage(resolvedBrowserID, res.PageID)
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			if res.PageID != "" {
				if _, err := fmt.Fprintln(out, res.PageID); err != nil {
					return err
				}
				return printActionMeta(out, res.PageActionMeta)
			}
			_, err = fmt.Fprintln(out, res.Message)
			return err
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")
	cmd.Flags().StringVar(&pageURL, "url", "", "Initial URL to open (optional)")
	snap.bind(cmd)

	return cmd
}
