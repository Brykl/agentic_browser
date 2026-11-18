package pages

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newListCmd(opts *config.Options) *cobra.Command {
	var browserID string

	cmd := &cobra.Command{
		Use:     "list",
		Aliases: []string{"ls"},
		Short:   "List pages in a browser session",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			resolvedBrowserID, err := opts.ResolveBrowserID(browserID)
			if err != nil {
				return err
			}

			res, err := opts.NewClient().ListPages(cmd.Context(), resolvedBrowserID)
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			if len(res.Pages) == 0 {
				_, err := fmt.Fprintln(out, "No open pages.")
				return err
			}

			st, _ := opts.LoadState()
			activePageID := ""
			if st != nil {
				activePageID = st.PageID
			}

			tw := output.NewTabWriter(out)
			fmt.Fprintln(tw, "ACTIVE\tPAGE ID\tURL")
			for _, p := range res.Pages {
				marker := " "
				if p.PageID == activePageID {
					marker = "*"
				}
				fmt.Fprintf(tw, "%s\t%s\t%s\n", marker, p.PageID, p.URL)
			}
			return tw.Flush()
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")

	return cmd
}
