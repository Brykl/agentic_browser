package browsers

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newCreateCmd(opts *config.Options) *cobra.Command {
	var (
		ownerID  string
		headless bool
	)

	cmd := &cobra.Command{
		Use:   "create",
		Short: "Create a new browser session",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			res, err := opts.NewClient().CreateBrowser(cmd.Context(), client.CreateBrowserRequest{
				OwnerID:  ownerID,
				Headless: &headless,
			})
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			_, err = fmt.Fprintln(out, res.BrowserID)
			return err
		},
	}

	cmd.Flags().StringVar(&ownerID, "owner-id", "", "Owner identifier (required)")
	cmd.Flags().BoolVar(&headless, "headless", true, "Run browser in headless mode")
	_ = cmd.MarkFlagRequired("owner-id")

	return cmd
}
