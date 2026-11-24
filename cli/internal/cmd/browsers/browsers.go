package browsers

import (
	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/config"
)

// NewCmd returns the `browsers` command group.
func NewCmd(opts *config.Options) *cobra.Command {
	cmd := &cobra.Command{
		Use:     "browsers",
		Aliases: []string{"browser"},
		Short:   "Manage browser sessions",
	}

	cmd.AddCommand(
		newListCmd(opts),
		newCreateCmd(opts),
		newDeleteCmd(opts),
	)

	return cmd
}
