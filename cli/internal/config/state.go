package config

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/Brykl/agentic_browser/cli/internal/client"
)

const (
	// DefaultBrowserID matches DEFAULT_BROWSER_ID created on API server startup.
	DefaultBrowserID = "18c38237-e214-4e9e-a3d9-05193b95837a"
	// DefaultPageID matches DEFAULT_PAGE_ID created on API server startup.
	DefaultPageID = "269cb5c2-0de6-4447-9ec1-620e7e117cf5"

	errBrowserIDRequired = "browser ID is required: pass --browser-id, set with 'agb use browser <id>', or create one with 'agb browsers create'"
	errPageIDRequired    = "page ID is required: pass <page-id>, set with 'agb use page <id>', or create one with 'agb pages create'"
)

// State stores the currently active browser and page IDs on disk.
type State struct {
	BrowserID string `json:"browserId,omitempty"`
	PageID    string `json:"pageId,omitempty"`
}

// DefaultStatePath returns the default file path for storing CLI state.
func DefaultStatePath() string {
	if envPath := strings.TrimSpace(os.Getenv("AGB_STATE_FILE")); envPath != "" {
		return envPath
	}
	dir, err := os.UserConfigDir()
	if err != nil || dir == "" {
		dir = os.TempDir()
	}
	return filepath.Join(dir, "agb", "state.json")
}

// LoadState reads the active CLI state from disk. If the file does not exist, an empty State is returned.
func (o *Options) LoadState() (*State, error) {
	path := o.stateFilePath()
	raw, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return &State{}, nil
		}
		return nil, fmt.Errorf("read state file: %w", err)
	}
	if len(strings.TrimSpace(string(raw))) == 0 {
		return &State{}, nil
	}
	var st State
	if err := json.Unmarshal(raw, &st); err != nil {
		return nil, fmt.Errorf("parse state file: %w", err)
	}
	return &st, nil
}

// SaveState writes the active CLI state to disk.
func (o *Options) SaveState(st *State) error {
	if st == nil {
		st = &State{}
	}
	path := o.stateFilePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create state dir: %w", err)
	}
	raw, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return fmt.Errorf("encode state: %w", err)
	}
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		return fmt.Errorf("write state file: %w", err)
	}
	return nil
}

// SetActiveBrowser sets the active browser ID in state and resets the active page ID if the browser changed.
func (o *Options) SetActiveBrowser(browserID string) error {
	st, err := o.LoadState()
	if err != nil {
		st = &State{}
	}
	if st.BrowserID != browserID {
		st.PageID = ""
	}
	st.BrowserID = browserID
	return o.SaveState(st)
}

// SetActivePage sets the active page ID (and browser ID if provided) in state.
func (o *Options) SetActivePage(browserID, pageID string) error {
	st, err := o.LoadState()
	if err != nil {
		st = &State{}
	}
	if browserID != "" {
		st.BrowserID = browserID
	}
	st.PageID = pageID
	return o.SaveState(st)
}

// ClearActiveBrowser clears the active browser ID (and active page ID) if it matches browserID (or unconditionally if browserID is empty).
func (o *Options) ClearActiveBrowser(browserID string) error {
	st, err := o.LoadState()
	if err != nil {
		return nil
	}
	if browserID == "" || st.BrowserID == browserID {
		st.BrowserID = ""
		st.PageID = ""
		return o.SaveState(st)
	}
	return nil
}

// ClearActivePage clears the active page ID if it matches pageID (or unconditionally if pageID is empty).
func (o *Options) ClearActivePage(pageID string) error {
	st, err := o.LoadState()
	if err != nil {
		return nil
	}
	if pageID == "" || st.PageID == pageID {
		st.PageID = ""
		return o.SaveState(st)
	}
	return nil
}

// ResolveBrowserIDStrict returns flagBrowserID if non-empty, otherwise falls back to AGB_BROWSER_ID or saved state.
// Unlike ResolveBrowserID, it never queries the API to auto-select a browser (used for destructive commands).
func (o *Options) ResolveBrowserIDStrict(flagBrowserID string) (string, error) {
	if id := explicitBrowserID(flagBrowserID); id != "" {
		return id, nil
	}
	st, err := o.LoadState()
	if err != nil {
		return "", err
	}
	if st.BrowserID != "" {
		return st.BrowserID, nil
	}
	return "", errors.New(errBrowserIDRequired)
}

// ResolvePageIDStrict returns argPageID if provided, otherwise falls back to AGB_PAGE_ID or saved state
// (only when saved state matches browserID, if both are set).
// Unlike ResolvePageID, it never queries the API to auto-select a page (used for destructive commands).
func (o *Options) ResolvePageIDStrict(browserID string, args []string) (string, error) {
	if id := explicitPageID(args); id != "" {
		return id, nil
	}
	st, err := o.LoadState()
	if err != nil {
		return "", err
	}
	if st.PageID != "" && stateMatchesBrowser(st, browserID) {
		return st.PageID, nil
	}
	return "", errors.New(errPageIDRequired)
}

// ResolveBrowserID returns flagBrowserID if non-empty, otherwise falls back to AGB_BROWSER_ID, saved state,
// or auto-selects the sole active (or default) browser via GET /api/v1/browsers.
func (o *Options) ResolveBrowserID(ctx context.Context, flagBrowserID string) (string, error) {
	if id := explicitBrowserID(flagBrowserID); id != "" {
		return id, nil
	}
	st, err := o.LoadState()
	if err != nil {
		return "", err
	}
	if st.BrowserID != "" {
		return st.BrowserID, nil
	}
	if strings.TrimSpace(o.BaseURL) == "" {
		return "", errors.New(errBrowserIDRequired)
	}

	res, err := o.NewClient().ListBrowsers(ctx)
	if err != nil {
		return "", fmt.Errorf("auto-select browser failed (%w); pass --browser-id or run 'agb use browser <id>'", err)
	}
	picked, err := pickBrowser(res.Browsers)
	if err != nil {
		return "", err
	}
	_ = o.SetActiveBrowser(picked.ID)
	return picked.ID, nil
}

// ResolvePageID returns argPageID if provided, otherwise falls back to AGB_PAGE_ID, saved state
// (when matching browserID), or auto-selects the sole open (or default) page of browserID via GET /api/v1/browsers.
func (o *Options) ResolvePageID(ctx context.Context, browserID string, args []string) (string, error) {
	if id := explicitPageID(args); id != "" {
		return id, nil
	}
	st, err := o.LoadState()
	if err != nil {
		return "", err
	}
	if st.PageID != "" && stateMatchesBrowser(st, browserID) {
		return st.PageID, nil
	}
	if strings.TrimSpace(o.BaseURL) == "" || strings.TrimSpace(browserID) == "" {
		return "", errors.New(errPageIDRequired)
	}

	res, err := o.NewClient().ListBrowsers(ctx)
	if err != nil {
		return "", fmt.Errorf("auto-select page failed (%w); pass <page-id> or run 'agb use page <id>'", err)
	}
	browser := findBrowserByID(res.Browsers, browserID)
	if browser == nil {
		return "", fmt.Errorf("browser %s not found on server; pass <page-id> or run 'agb browsers list'", browserID)
	}
	pageID, err := pickPage(*browser)
	if err != nil {
		return "", err
	}
	if st.BrowserID == browserID {
		_ = o.SetActivePage(browserID, pageID)
	}
	return pageID, nil
}

// ResolveTarget resolves both browserID and pageID, performing at most one GET /api/v1/browsers call
// when either ID is missing from flags, environment variables, and saved state.
func (o *Options) ResolveTarget(ctx context.Context, flagBrowserID string, pageArgs []string) (string, string, error) {
	st, err := o.LoadState()
	if err != nil {
		return "", "", err
	}

	expBrowser := explicitBrowserID(flagBrowserID)
	browserID := expBrowser
	if browserID == "" {
		browserID = st.BrowserID
	}

	expPage := explicitPageID(pageArgs)
	pageID := expPage
	if pageID == "" && st.PageID != "" && stateMatchesBrowser(st, browserID) {
		pageID = st.PageID
	}

	if browserID != "" && pageID != "" {
		return browserID, pageID, nil
	}

	if strings.TrimSpace(o.BaseURL) == "" {
		if browserID == "" {
			return "", "", errors.New(errBrowserIDRequired)
		}
		return "", "", errors.New(errPageIDRequired)
	}

	res, err := o.NewClient().ListBrowsers(ctx)
	if err != nil {
		if browserID == "" {
			return "", "", fmt.Errorf("auto-select browser failed (%w); pass --browser-id or run 'agb use browser <id>'", err)
		}
		return "", "", fmt.Errorf("auto-select page failed (%w); pass <page-id> or run 'agb use page <id>'", err)
	}

	browserFromAuto := false
	var matchedBrowser *client.BrowserInfo
	if browserID == "" {
		picked, err := pickBrowser(res.Browsers)
		if err != nil {
			return "", "", err
		}
		browserID = picked.ID
		matchedBrowser = picked
		browserFromAuto = true
	} else {
		matchedBrowser = findBrowserByID(res.Browsers, browserID)
	}

	if pageID == "" {
		if matchedBrowser == nil {
			return "", "", fmt.Errorf("browser %s not found on server; pass <page-id> or run 'agb browsers list'", browserID)
		}
		pickedPage, err := pickPage(*matchedBrowser)
		if err != nil {
			if browserFromAuto {
				_ = o.SetActiveBrowser(browserID)
			}
			return "", "", err
		}
		pageID = pickedPage
		if browserFromAuto || (expBrowser == "" && st.BrowserID == browserID) {
			_ = o.SetActivePage(browserID, pageID)
		}
	} else if browserFromAuto {
		_ = o.SetActiveBrowser(browserID)
	}

	return browserID, pageID, nil
}

func explicitBrowserID(flagBrowserID string) string {
	if id := strings.TrimSpace(flagBrowserID); id != "" {
		return id
	}
	return strings.TrimSpace(os.Getenv("AGB_BROWSER_ID"))
}

func explicitPageID(args []string) string {
	if len(args) > 0 {
		if id := strings.TrimSpace(args[0]); id != "" {
			return id
		}
	}
	return strings.TrimSpace(os.Getenv("AGB_PAGE_ID"))
}

func stateMatchesBrowser(st *State, browserID string) bool {
	if st == nil {
		return false
	}
	return st.BrowserID == "" || browserID == "" || st.BrowserID == browserID
}

func findBrowserByID(browsers []client.BrowserInfo, browserID string) *client.BrowserInfo {
	for i := range browsers {
		if browsers[i].ID == browserID {
			return &browsers[i]
		}
	}
	return nil
}

func pickBrowser(browsers []client.BrowserInfo) (*client.BrowserInfo, error) {
	switch len(browsers) {
	case 0:
		return nil, errors.New("no active browsers found on server; create one with 'agb browsers create'")
	case 1:
		return &browsers[0], nil
	default:
		if def := findBrowserByID(browsers, DefaultBrowserID); def != nil {
			return def, nil
		}
		return nil, fmt.Errorf("multiple active browsers (%d) found; pass --browser-id or run 'agb use browser <id>'", len(browsers))
	}
}

func pickPage(browser client.BrowserInfo) (string, error) {
	switch len(browser.PageIDs) {
	case 0:
		return "", fmt.Errorf("browser %s has no open pages; create one with 'agb pages create'", browser.ID)
	case 1:
		return browser.PageIDs[0], nil
	default:
		for _, id := range browser.PageIDs {
			if id == DefaultPageID {
				return id, nil
			}
		}
		return "", fmt.Errorf("multiple open pages (%d) in browser %s; pass <page-id> or run 'agb use page <id>'", len(browser.PageIDs), browser.ID)
	}
}

func (o *Options) stateFilePath() string {
	if strings.TrimSpace(o.StateFile) != "" {
		return o.StateFile
	}
	return DefaultStatePath()
}
