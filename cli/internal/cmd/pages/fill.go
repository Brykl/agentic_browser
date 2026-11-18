package pages

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newFillCmd(opts *config.Options) *cobra.Command {
	var (
		browserID string
		ref       int
		value     string
	)

	cmd := &cobra.Command{
		Use:     "fill [page-id]",
		Aliases: []string{"type", "input"},
		Short:   "Fill a form field on a page by its snapshot ref",
		Args:    cobra.MaximumNArgs(1),
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

			res, err := opts.NewClient().FillPage(cmd.Context(), resolvedPageID, client.FillPageRequest{
				BrowserID: resolvedBrowserID,
				Ref:       ref,
				Value:     value,
			})
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			_, err = fmt.Fprintf(out, "Filled ref [%d] with %q\n", res.Ref, res.Value)
			return err
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")
	cmd.Flags().IntVar(&ref, "ref", 0, "Element ref number from snapshot (required, >= 1)")
	cmd.Flags().StringVarP(&value, "value", "v", "", "Text value to enter into the element (required)")
	_ = cmd.MarkFlagRequired("ref")
	_ = cmd.MarkFlagRequired("value")

	return cmd
}
