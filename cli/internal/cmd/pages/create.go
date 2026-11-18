package pages

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newCreateCmd(opts *config.Options) *cobra.Command {
	var (
		browserID string
		pageURL   string
	)

	cmd := &cobra.Command{
		Use:   "create",
		Short: "Open a new page in a browser session",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			res, err := opts.NewClient().CreatePage(cmd.Context(), client.CreatePageRequest{
				BrowserID: browserID,
				PageURL:   pageURL,
			})
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			if res.PageID != "" {
				_, err = fmt.Fprintln(out, res.PageID)
				return err
			}
			_, err = fmt.Fprintln(out, res.Message)
			return err
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (required)")
	cmd.Flags().StringVar(&pageURL, "url", "", "Initial URL to open (optional)")
	_ = cmd.MarkFlagRequired("browser-id")

	return cmd
}
