package pages

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newClickCmd(opts *config.Options) *cobra.Command {
	var (
		browserID string
		ref       int
	)

	cmd := &cobra.Command{
		Use:   "click [page-id]",
		Short: "Click an element on a page by its snapshot ref",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if ref < 1 {
				return fmt.Errorf("--ref must be >= 1")
			}

			resolvedBrowserID, err := opts.ResolveBrowserID(browserID)
			if err != nil {
				return err
			}
			resolvedPageID, err := opts.ResolvePageID(args)
			if err != nil {
				return err
			}

			res, err := opts.NewClient().ClickPage(cmd.Context(), resolvedPageID, client.ClickPageRequest{
				BrowserID: resolvedBrowserID,
				Ref:       ref,
			})
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			_, err = fmt.Fprintf(out, "Clicked ref [%d] at (%.1f, %.1f)\n", res.Ref, res.X, res.Y)
			return err
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")
	cmd.Flags().IntVar(&ref, "ref", 0, "Element ref number from snapshot (required, >= 1)")
	_ = cmd.MarkFlagRequired("ref")

	return cmd
}
