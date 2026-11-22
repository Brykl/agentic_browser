package pages

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newFillCmd(opts *config.Options) *cobra.Command {
	var (
		browserID string
		ref       string
		value     string
	)

	cmd := &cobra.Command{
		Use:     "fill [page-id]",
		Aliases: []string{"type", "input"},
		Short:   "Fill a form field on a page by its snapshot ref",
		Args:    cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ref = strings.TrimSpace(ref)
			if ref == "" {
				return fmt.Errorf("--ref must not be empty")
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

			_, err = fmt.Fprintf(out, "Filled ref [%s] with %q\n", res.Ref, res.Value)
			return err
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")
	cmd.Flags().StringVar(&ref, "ref", "", "Element ref ID from snapshot (required, e.g. e8)")
	cmd.Flags().StringVarP(&value, "value", "v", "", "Text value to enter into the element (required)")
	_ = cmd.MarkFlagRequired("ref")
	_ = cmd.MarkFlagRequired("value")

	return cmd
}
