package browsers

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newListCmd(opts *config.Options) *cobra.Command {
	return &cobra.Command{
		Use:     "list",
		Aliases: []string{"ls"},
		Short:   "List active browser sessions",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			res, err := opts.NewClient().ListBrowsers(cmd.Context())
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			if len(res.Browsers) == 0 {
				_, err := fmt.Fprintln(out, "No active browsers.")
				return err
			}

			st, _ := opts.LoadState()
			activeBrowserID := ""
			if st != nil {
				activeBrowserID = st.BrowserID
			}

			tw := output.NewTabWriter(out)
			fmt.Fprintln(tw, "ACTIVE\tID\tOWNER\tPAGES\tLAST USED")
			for _, b := range res.Browsers {
				marker := " "
				if b.ID == activeBrowserID {
					marker = "*"
				}
				lastUsed := time.UnixMilli(b.LastUsed).Format(time.RFC3339)
				pages := "-"
				if len(b.PageIDs) > 0 {
					pages = strings.Join(b.PageIDs, ",")
				}
				fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t%s\n", marker, b.ID, b.OwnerID, pages, lastUsed)
			}
			return tw.Flush()
		},
	}
}
