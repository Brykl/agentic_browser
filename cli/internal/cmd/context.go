package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newUseCmd(opts *config.Options) *cobra.Command {
	cmd := &cobra.Command{
		Use:   "use",
		Short: "Set the active browser or page context",
	}

	cmd.AddCommand(
		newUseBrowserCmd(opts),
		newUsePageCmd(opts),
	)

	return cmd
}

func newUseBrowserCmd(opts *config.Options) *cobra.Command {
	return &cobra.Command{
		Use:     "browser <browser-id>",
		Aliases: []string{"browsers"},
		Short:   "Set the active browser session ID",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			browserID := args[0]
			if err := opts.SetActiveBrowser(browserID); err != nil {
				return err
			}

			st, _ := opts.LoadState()
			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, st)
			}

			_, err := fmt.Fprintf(out, "Active browser set to %s\n", browserID)
			return err
		},
	}
}

func newUsePageCmd(opts *config.Options) *cobra.Command {
	var browserID string

	cmd := &cobra.Command{
		Use:     "page <page-id>",
		Aliases: []string{"pages"},
		Short:   "Set the active page ID (and optionally browser ID)",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			pageID := args[0]
			if err := opts.SetActivePage(browserID, pageID); err != nil {
				return err
			}

			st, _ := opts.LoadState()
			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, st)
			}

			if st != nil && st.BrowserID != "" {
				_, err := fmt.Fprintf(out, "Active page set to %s (browser: %s)\n", pageID, st.BrowserID)
				return err
			}
			_, err := fmt.Fprintf(out, "Active page set to %s\n", pageID)
			return err
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Also update active browser session ID")

	return cmd
}

func newStatusCmd(opts *config.Options) *cobra.Command {
	var clearState bool

	cmd := &cobra.Command{
		Use:     "status",
		Aliases: []string{"context", "ctx"},
		Short:   "Show or clear the active browser and page context",
		Args:    cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if clearState {
				if err := opts.SaveState(&config.State{}); err != nil {
					return err
				}
			}

			st, err := opts.LoadState()
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()
			if opts.JSON {
				return output.PrintJSON(out, st)
			}

			if clearState {
				_, err := fmt.Fprintln(out, "Cleared active context.")
				return err
			}

			browserVal := st.BrowserID
			if browserVal == "" {
				browserVal = "(none)"
			}
			pageVal := st.PageID
			if pageVal == "" {
				pageVal = "(none)"
			}

			tw := output.NewTabWriter(out)
			fmt.Fprintf(tw, "Active Browser ID:\t%s\n", browserVal)
			fmt.Fprintf(tw, "Active Page ID:\t%s\n", pageVal)
			return tw.Flush()
		},
	}

	cmd.Flags().BoolVar(&clearState, "clear", false, "Clear saved active browser and page context")

	return cmd
}
