package pages

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func newUpdateCmd(opts *config.Options) *cobra.Command {
	var (
		browserID string
		pageURL   string
		snap      snapshotFlags
	)

	cmd := &cobra.Command{
		Use:     "update [page-id]",
		Aliases: []string{"navigate", "goto"},
		Short:   "Navigate a page to a new URL",
		Args:    cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			snapshotMode, err := snap.mode()
			if err != nil {
				return err
			}

			resolvedBrowserID, resolvedPageID, err := opts.ResolveTarget(cmd.Context(), browserID, args)
			if err != nil {
				return err
			}

			res, err := opts.NewClient().UpdatePage(cmd.Context(), resolvedPageID, client.UpdatePageRequest{
				BrowserID: resolvedBrowserID,
				PageURL:   pageURL,
				Snapshot:  snapshotMode,
			})
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
			if err := tw.Flush(); err != nil {
				return err
			}
			return printActionSnapshot(out, res.Snapshot, res.SnapshotMode)
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")
	cmd.Flags().StringVar(&pageURL, "url", "", "Target URL (required)")
	_ = cmd.MarkFlagRequired("url")
	snap.bind(cmd)

	return cmd
}
