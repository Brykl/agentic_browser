package pages

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newClickCmd(opts *config.Options) *cobra.Command {
	var (
		browserID string
		ref       string
		snap      snapshotFlags
	)

	cmd := &cobra.Command{
		Use:   "click [page-id]",
		Short: "Click an element on a page by its snapshot ref",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ref = strings.TrimSpace(ref)
			if ref == "" {
				return fmt.Errorf("--ref must not be empty")
			}
			snapshotMode, err := snap.mode()
			if err != nil {
				return err
			}

			resolvedBrowserID, resolvedPageID, err := opts.ResolveTarget(cmd.Context(), browserID, args)
			if err != nil {
				return err
			}

			res, err := opts.NewClient().ClickPage(cmd.Context(), resolvedPageID, client.ClickPageRequest{
				BrowserID: resolvedBrowserID,
				Ref:       ref,
				Snapshot:  snapshotMode,
			})
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			if _, err := fmt.Fprintf(out, "Clicked ref [%s] at (%.1f, %.1f)\n", res.Ref, res.X, res.Y); err != nil {
				return err
			}
			return printActionMeta(out, res.PageActionMeta)
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")
	cmd.Flags().StringVar(&ref, "ref", "", "Element ref ID from snapshot (required, e.g. e5)")
	_ = cmd.MarkFlagRequired("ref")
	snap.bind(cmd)

	return cmd
}
