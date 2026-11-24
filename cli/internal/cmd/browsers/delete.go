package browsers

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newDeleteCmd(opts *config.Options) *cobra.Command {
	cmd := &cobra.Command{
		Use:     "delete [browser-id]",
		Aliases: []string{"rm", "del", "close"},
		Short:   "Close and delete a browser session",
		Args:    cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			var argBrowserID string
			if len(args) > 0 {
				argBrowserID = args[0]
			}
			resolvedBrowserID, err := opts.ResolveBrowserID(argBrowserID)
			if err != nil {
				return err
			}

			res, err := opts.NewClient().DeleteBrowser(cmd.Context(), resolvedBrowserID)
			if err != nil {
				return err
			}

			_ = opts.ClearActiveBrowser(resolvedBrowserID)

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			_, err = fmt.Fprintf(out, "Deleted browser %s\n", res.BrowserID)
			return err
		},
	}

	return cmd
}
