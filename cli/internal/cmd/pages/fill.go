package pages

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Brykl/agentic_browser/cli/internal/client"
	"github.com/Brykl/agentic_browser/cli/internal/config"
	"github.com/Brykl/agentic_browser/cli/internal/output"
)

func parseFillFields(fieldSpecs []string, fieldsJSON string) ([]client.FillField, error) {
	var fields []client.FillField

	if strings.TrimSpace(fieldsJSON) != "" {
		var parsed []client.FillField
		if err := json.Unmarshal([]byte(fieldsJSON), &parsed); err != nil {
			return nil, fmt.Errorf("invalid --fields-json: %w", err)
		}
		for i, f := range parsed {
			ref := strings.TrimSpace(f.Ref)
			if ref == "" {
				return nil, fmt.Errorf("--fields-json item %d has empty ref", i)
			}
			fields = append(fields, client.FillField{Ref: ref, Value: f.Value})
		}
	}

	for _, spec := range fieldSpecs {
		rawRef, val, ok := strings.Cut(spec, "=")
		if !ok {
			return nil, fmt.Errorf("invalid --field %q: expected format ref=value", spec)
		}
		ref := strings.TrimSpace(rawRef)
		if ref == "" {
			return nil, fmt.Errorf("invalid --field %q: ref must not be empty", spec)
		}
		fields = append(fields, client.FillField{Ref: ref, Value: val})
	}

	if len(fields) == 0 {
		return nil, fmt.Errorf("at least one field must be specified")
	}

	return fields, nil
}

func newFillCmd(opts *config.Options) *cobra.Command {
	var (
		browserID  string
		ref        string
		value      string
		fieldSpecs []string
		fieldsJSON string
		snap       snapshotFlags
	)

	cmd := &cobra.Command{
		Use:     "fill [page-id]",
		Aliases: []string{"type", "input"},
		Short:   "Fill one or more form fields on a page by snapshot ref",
		Args:    cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			singleUsed := cmd.Flags().Changed("ref") || cmd.Flags().Changed("value")
			batchUsed := len(fieldSpecs) > 0 || cmd.Flags().Changed("fields-json")

			if singleUsed && batchUsed {
				return fmt.Errorf("cannot combine --ref/--value with --field/--fields-json")
			}
			if !singleUsed && !batchUsed {
				return fmt.Errorf("specify either --ref and --value, or one or more --field ref=value (or --fields-json)")
			}

			snapshotMode, err := snap.mode()
			if err != nil {
				return err
			}

			resolvedBrowserID, resolvedPageID, err := opts.ResolveTarget(cmd.Context(), browserID, args)
			if err != nil {
				return err
			}

			out := cmd.OutOrStdout()

			if batchUsed {
				fields, err := parseFillFields(fieldSpecs, fieldsJSON)
				if err != nil {
					return err
				}

				res, err := opts.NewClient().FillPageFields(cmd.Context(), resolvedPageID, client.FillFieldsRequest{
					BrowserID: resolvedBrowserID,
					Fields:    fields,
					Snapshot:  snapshotMode,
				})
				if err != nil {
					return err
				}

				if opts.JSON {
					return output.PrintJSON(out, res)
				}

				if _, err := fmt.Fprintf(out, "Filled %d fields:\n", len(res.Results)); err != nil {
					return err
				}
				for _, r := range res.Results {
					if _, err := fmt.Fprintf(out, "  [%s] = %q\n", r.Ref, r.Value); err != nil {
						return err
					}
				}
				return printActionMeta(out, res.PageActionMeta)
			}

			ref = strings.TrimSpace(ref)
			if ref == "" {
				return fmt.Errorf("--ref must not be empty")
			}
			if !cmd.Flags().Changed("value") {
				return fmt.Errorf("--value is required when using --ref")
			}

			res, err := opts.NewClient().FillPage(cmd.Context(), resolvedPageID, client.FillPageRequest{
				BrowserID: resolvedBrowserID,
				Ref:       ref,
				Value:     value,
				Snapshot:  snapshotMode,
			})
			if err != nil {
				return err
			}

			if opts.JSON {
				return output.PrintJSON(out, res)
			}

			if _, err := fmt.Fprintf(out, "Filled ref [%s] with %q\n", res.Ref, res.Value); err != nil {
				return err
			}
			return printActionMeta(out, res.PageActionMeta)
		},
	}

	cmd.Flags().StringVar(&browserID, "browser-id", "", "Browser session ID (defaults to active browser)")
	cmd.Flags().StringVar(&ref, "ref", "", "Element ref ID from snapshot (e.g. e8)")
	cmd.Flags().StringVarP(&value, "value", "v", "", "Text value to enter into the element")
	cmd.Flags().StringArrayVarP(&fieldSpecs, "field", "f", nil, "Repeatable field assignment in ref=value format (e.g. -f e8=user@example.com -f e9=secret)")
	cmd.Flags().StringVar(&fieldsJSON, "fields-json", "", `JSON array of fields to fill (e.g. '[{"ref":"e8","value":"hello"}]')`)
	snap.bind(cmd)

	return cmd
}
