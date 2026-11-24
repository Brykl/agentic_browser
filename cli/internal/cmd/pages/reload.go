package pages

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newReloadCmd(opts *config.Options) *cobra.Command {
	var (
		browserID string
		snap      snapshotFlags
	)

	cmd := &cobra.Command{
		Use:     "reload [page-id]",
		Aliases: []string{"refresh"},
		Short:   "Reload a page",
		Args:    cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			snapshotMode, err := snap.mode()
			if err != nil {
				return err
			}

			resolvedBrowserID, resolvedPageID, err := opts.ResolveTarget(cmd.Context(), browserID, args)
			if err != nil {
				return err
			}

			res, err := opts.NewClient().ReloadPage(cmd.Context(), resolvedPageID, client.ReloadPageRequest{
				BrowserID: resolvedBrowserID,
				Snapshot:  snapshotMode,
			})
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			if _, err := fmt.Fprintf(out, "Reloaded page %s\n", res.PageID); err != nil {
				return err
			}
			return printActionMeta(out, res.PageActionMeta)
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")
	snap.bind(cmd)

	return cmd
}
