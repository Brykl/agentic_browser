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
	)

	cmd := &cobra.Command{
		Use:   "create",
		Short: "Open a new page in a browser session",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			resolvedBrowserID, err := opts.ResolveBrowserID(browserID)
			if err != nil {
				return err
			}

			res, err := opts.NewClient().CreatePage(cmd.Context(), client.CreatePageRequest{
				BrowserID: resolvedBrowserID,
				PageURL:   pageURL,
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
				_, err = fmt.Fprintln(out, res.PageID)
				return err
			}
			_, err = fmt.Fprintln(out, res.Message)
			return err
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")
	cmd.Flags().StringVar(&pageURL, "url", "", "Initial URL to open (optional)")

	return cmd
}
