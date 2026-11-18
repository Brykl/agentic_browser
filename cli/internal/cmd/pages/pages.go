package pages

import (
	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/config"
)

// NewCmd returns the `pages` command group.
func NewCmd(opts *config.Options) *cobra.Command {
	cmd := &cobra.Command{
		Use:     "pages",
		Aliases: []string{"page"},
		Short:   "Manage browser pages and interact with them",
	}

	cmd.AddCommand(
		newListCmd(opts),
		newCreateCmd(opts),
		newGetCmd(opts),
		newUpdateCmd(opts),
		newDeleteCmd(opts),
		newReloadCmd(opts),
		newSnapshotCmd(opts),
		newClickCmd(opts),
		newFillCmd(opts),
		newScrollCmd(opts),
		newScrollInfoCmd(opts),
	)

	return cmd
}
