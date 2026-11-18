package main

import (
	"os"

	"github.com/Brykl/agentic_browser/cli/internal/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
