package pages

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newSnapshotCmd(opts *config.Options) *cobra.Command {
	var (
		browserID string
		full      bool
	)

	cmd := &cobra.Command{
		Use:   "snapshot [page-id]",
		Short: "Capture an accessibility snapshot of a page",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			resolvedBrowserID, err := opts.ResolveBrowserID(browserID)
			if err != nil {
				return err
			}
			resolvedPageID, err := opts.ResolvePageID(args)
			if err != nil {
				return err
			}

			res, err := opts.NewClient().SnapshotPage(cmd.Context(), resolvedBrowserID, resolvedPageID, full)
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			_, err = fmt.Fprintln(out, res.Snapshot)
			return err
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")
	cmd.Flags().BoolVar(&full, "full", false, "Return the full uncompacted accessibility snapshot")

	return cmd
}
