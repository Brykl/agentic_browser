package pages

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newDeleteCmd(opts *config.Options) *cobra.Command {
	var browserID string

	cmd := &cobra.Command{
		Use:     "delete [page-id]",
		Aliases: []string{"rm", "del"},
		Short:   "Close and delete a page",
		Args:    cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			resolvedBrowserID, err := opts.ResolveBrowserIDStrict(browserID)
			if err != nil {
				return err
			}
			resolvedPageID, err := opts.ResolvePageIDStrict(resolvedBrowserID, args)
			if err != nil {
				return err
			}

			res, err := opts.NewClient().DeletePage(cmd.Context(), resolvedBrowserID, resolvedPageID)
			if err != nil {
				return err
			}

			_ = opts.ClearActivePage(resolvedPageID)

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			_, err = fmt.Fprintf(out, "Deleted page %s\n", res.PageID)
			return err
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")

	return cmd
}
