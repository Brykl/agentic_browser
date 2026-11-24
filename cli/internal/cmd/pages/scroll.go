package pages

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newScrollCmd(opts *config.Options) *cobra.Command {
	var (
		browserID string
		left      float64
		top       float64
		snap      snapshotFlags
	)

	cmd := &cobra.Command{
		Use:   "scroll [page-id]",
		Short: "Scroll a page by (left, top) pixels or inspect current/available scroll if no offsets are given",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			snapshotMode, err := snap.mode()
			if err != nil {
				return err
			}

			resolvedBrowserID, resolvedPageID, err := opts.ResolveTarget(cmd.Context(), browserID, args)
			if err != nil {
				return err
			}

			leftChanged := cmd.Flags().Changed("left")
			topChanged := cmd.Flags().Changed("top")

			out := cmd.OutOrStdout()

			if !leftChanged && !topChanged {
				res, err := opts.NewClient().GetPageScroll(cmd.Context(), resolvedBrowserID, resolvedPageID)
				if err != nil {
					return err
				}
				if opts.JSON {
					return output.PrintJSON(out, res)
				}
				_, err = fmt.Fprintf(out, "Scroll position: (%.1f, %.1f) / max: (%.1f, %.1f)\n", res.X, res.Y, res.MaxX, res.MaxY)
				return err
			}

			res, err := opts.NewClient().ScrollPage(cmd.Context(), resolvedPageID, client.ScrollPageRequest{
				BrowserID: resolvedBrowserID,
				Left:      left,
				Top:       top,
				Snapshot:  snapshotMode,
			})
			if err != nil {
				return err
			}

			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			if _, err := fmt.Fprintf(out, "Scrolled by (%.1f, %.1f) -> position (%.1f, %.1f)\n", left, top, res.X, res.Y); err != nil {
				return err
			}
			return printActionMeta(out, res.PageActionMeta)
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")
	cmd.Flags().Float64Var(&left, "left", 0, "Horizontal scroll offset in pixels")
	cmd.Flags().Float64Var(&top, "top", 0, "Vertical scroll offset in pixels")
	snap.bind(cmd)

	return cmd
}

func newScrollInfoCmd(opts *config.Options) *cobra.Command {
	var browserID string

	cmd := &cobra.Command{
		Use:   "scroll-info [page-id]",
		Short: "Get current and maximum available scroll offsets of a page",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			resolvedBrowserID, resolvedPageID, err := opts.ResolveTarget(cmd.Context(), browserID, args)
			if err != nil {
				return err
			}

			res, err := opts.NewClient().GetPageScroll(cmd.Context(), resolvedBrowserID, resolvedPageID)
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			_, err = fmt.Fprintf(out, "Scroll position: (%.1f, %.1f) / max: (%.1f, %.1f)\n", res.X, res.Y, res.MaxX, res.MaxY)
			return err
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")

	return cmd
}
