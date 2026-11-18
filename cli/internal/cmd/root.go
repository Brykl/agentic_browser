package cmd

import (
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/cmd/browsers"
	"github.com/Brykl/agentic_browser/cli/internal/cmd/pages"
	"github.com/Brykl/agentic_browser/cli/internal/config"
)

// NewRootCmd builds the root CLI command with all subcommands attached.
func NewRootCmd() *cobra.Command {
	defaultURL := os.Getenv("AGENTIC_BROWSER_URL")
	if defaultURL == "" {
		defaultURL = client.DefaultBaseURL
	}

	opts := &config.Options{
		BaseURL: defaultURL,
		Timeout: 30 * time.Second,
	}

	rootCmd := &cobra.Command{
		Use:          "agb",
		Short:        "CLI client for the Agentic Browser API",
		SilenceUsage: true,
	}

	flags := rootCmd.PersistentFlags()
	flags.StringVar(&opts.BaseURL, "url", opts.BaseURL, "Base URL of the Agentic Browser API (or AGENTIC_BROWSER_URL)")
	flags.DurationVar(&opts.Timeout, "timeout", opts.Timeout, "HTTP request timeout")
	flags.BoolVar(&opts.JSON, "json", false, "Output raw JSON")

	rootCmd.AddCommand(
		browsers.NewCmd(opts),
		pages.NewCmd(opts),
		newUseCmd(opts),
		newStatusCmd(opts),
	)

	return rootCmd
}

// Execute runs the root CLI command.
func Execute() error {
	return NewRootCmd().Execute()
}
