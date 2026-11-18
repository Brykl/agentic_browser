package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
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

// ResolveBrowserID returns flagBrowserID if non-empty, otherwise falls back to AGB_BROWSER_ID or saved state.
func (o *Options) ResolveBrowserID(flagBrowserID string) (string, error) {
	if id := strings.TrimSpace(flagBrowserID); id != "" {
		return id, nil
	}
	if id := strings.TrimSpace(os.Getenv("AGB_BROWSER_ID")); id != "" {
		return id, nil
	}
	st, err := o.LoadState()
	if err != nil {
		return "", err
	}
	if st.BrowserID != "" {
		return st.BrowserID, nil
	}
	return "", errors.New("browser ID is required: pass --browser-id, set with 'agb use browser <id>', or create one with 'agb browsers create'")
}

// ResolvePageID returns argPageID if provided, otherwise falls back to AGB_PAGE_ID or saved state.
func (o *Options) ResolvePageID(args []string) (string, error) {
	if len(args) > 0 {
		if id := strings.TrimSpace(args[0]); id != "" {
			return id, nil
		}
	}
	if id := strings.TrimSpace(os.Getenv("AGB_PAGE_ID")); id != "" {
		return id, nil
	}
	st, err := o.LoadState()
	if err != nil {
		return "", err
	}
	if st.PageID != "" {
		return st.PageID, nil
	}
	return "", errors.New("page ID is required: pass <page-id>, set with 'agb use page <id>', or create one with 'agb pages create'")
}

func (o *Options) stateFilePath() string {
	if strings.TrimSpace(o.StateFile) != "" {
		return o.StateFile
	}
	return DefaultStatePath()
}
