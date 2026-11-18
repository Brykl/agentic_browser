package pages

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newGetCmd(opts *config.Options) *cobra.Command {
	var browserID string

	cmd := &cobra.Command{
		Use:   "get <page-id>",
		Short: "Get page details (URL and title)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			res, err := opts.NewClient().GetPage(cmd.Context(), browserID, args[0])
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			tw := output.NewTabWriter(out)
			fmt.Fprintf(tw, "Browser ID:\t%s\n", res.BrowserID)
			fmt.Fprintf(tw, "Page ID:\t%s\n", res.PageID)
			fmt.Fprintf(tw, "URL:\t%s\n", res.URL)
			fmt.Fprintf(tw, "Title:\t%s\n", res.Title)
			return tw.Flush()
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (required)")
	_ = cmd.MarkFlagRequired("browser-id")

	return cmd
}
