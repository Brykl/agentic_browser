package client

// BrowserInfo represents a browser session returned by GET /api/v1/browsers.
type BrowserInfo struct {
	ID       string   `json:"id"`
	Engine   string   `json:"engine,omitempty"`
	OwnerID  string   `json:"ownerId"`
	LastUsed int64    `json:"lastUsed"`
	PageIDs  []string `json:"pageIds"`
}

// ListBrowsersResponse is the response from GET /api/v1/browsers.
type ListBrowsersResponse struct {
	Browsers []BrowserInfo `json:"browsers"`
}

// CreateBrowserRequest is the payload for POST /api/v1/browsers.
type CreateBrowserRequest struct {
	OwnerID  string `json:"ownerId"`
	Headless *bool  `json:"headless,omitempty"`
	Engine   string `json:"engine,omitempty"`
}

// CreateBrowserResponse is the response from POST /api/v1/browsers.
type CreateBrowserResponse struct {
	BrowserID string `json:"browserId"`
}

// DeleteBrowserResponse is the response from DELETE /api/v1/browsers/:id.
type DeleteBrowserResponse struct {
	BrowserID string `json:"browserId"`
	Deleted   bool   `json:"deleted"`
}

// PageSummary represents a page item in GET /api/v1/browsers/pages.
type PageSummary struct {
	PageID string `json:"pageId"`
	URL    string `json:"url"`
}

// ListPagesResponse is the response from GET /api/v1/browsers/pages.
type ListPagesResponse struct {
	BrowserID string        `json:"browserId"`
	Pages     []PageSummary `json:"pages"`
}

// PageActionMeta holds page state metadata and optional snapshot returned after page actions.
type PageActionMeta struct {
	URL          string `json:"url,omitempty"`
	Title        string `json:"title,omitempty"`
	Navigated    bool   `json:"navigated,omitempty"`
	Snapshot     string `json:"snapshot,omitempty"`
	SnapshotMode string `json:"snapshotMode,omitempty"`
}

// CreatePageRequest is the payload for POST /api/v1/browsers/pages.
type CreatePageRequest struct {
	BrowserID string `json:"browserId"`
	PageURL   string `json:"pageUrl,omitempty"`
	Snapshot  string `json:"snapshot,omitempty"`
}

// CreatePageResponse is the parsed response from POST /api/v1/browsers/pages.
type CreatePageResponse struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId,omitempty"`
	Message   string `json:"message,omitempty"`
	PageActionMeta
}

// PageDetail is the response from GET and PATCH /api/v1/browsers/pages/:id.
type PageDetail struct {
	BrowserID    string `json:"browserId"`
	PageID       string `json:"pageId"`
	URL          string `json:"url"`
	Title        string `json:"title"`
	Navigated    bool   `json:"navigated,omitempty"`
	Snapshot     string `json:"snapshot,omitempty"`
	SnapshotMode string `json:"snapshotMode,omitempty"`
}

// UpdatePageRequest is the payload for PATCH /api/v1/browsers/pages/:id.
type UpdatePageRequest struct {
	BrowserID string `json:"browserId"`
	PageURL   string `json:"pageUrl"`
	Snapshot  string `json:"snapshot,omitempty"`
}

// DeletePageResponse is the response from DELETE /api/v1/browsers/pages/:id.
type DeletePageResponse struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId"`
	Deleted   bool   `json:"deleted"`
}

// PageSnapshotResponse is the response from GET /api/v1/browsers/pages/:id/snapshot.
type PageSnapshotResponse struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId"`
	Snapshot  string `json:"snapshot"`
}

// ClickPageRequest is the payload for POST /api/v1/browsers/pages/:id/click.
type ClickPageRequest struct {
	BrowserID string `json:"browserId"`
	Ref       string `json:"ref"`
	Snapshot  string `json:"snapshot,omitempty"`
}

// ClickPageResponse is the response from POST /api/v1/browsers/pages/:id/click.
type ClickPageResponse struct {
	BrowserID string  `json:"browserId"`
	PageID    string  `json:"pageId"`
	Clicked   bool    `json:"clicked"`
	Ref       string  `json:"ref"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	PageActionMeta
}

// FillPageRequest is the payload for POST /api/v1/browsers/pages/:id/fill (single field).
type FillPageRequest struct {
	BrowserID string `json:"browserId"`
	Ref       string `json:"ref"`
	Value     string `json:"value"`
	Snapshot  string `json:"snapshot,omitempty"`
}

// FillPageResponse is the response from POST /api/v1/browsers/pages/:id/fill (single field).
type FillPageResponse struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId"`
	Filled    bool   `json:"filled"`
	Ref       string `json:"ref"`
	Value     string `json:"value"`
	PageActionMeta
}

// FillField represents a single ref/value pair in a batch fill request.
type FillField struct {
	Ref   string `json:"ref"`
	Value string `json:"value"`
}

// FillFieldResult represents a single field outcome in a batch fill response.
type FillFieldResult struct {
	Filled bool   `json:"filled"`
	Ref    string `json:"ref"`
	Value  string `json:"value"`
}

// FillFieldsRequest is the payload for POST /api/v1/browsers/pages/:id/fill (batch mode).
type FillFieldsRequest struct {
	BrowserID string      `json:"browserId"`
	Fields    []FillField `json:"fields"`
	Snapshot  string      `json:"snapshot,omitempty"`
}

// FillFieldsResponse is the response from POST /api/v1/browsers/pages/:id/fill (batch mode).
type FillFieldsResponse struct {
	BrowserID string            `json:"browserId"`
	PageID    string            `json:"pageId"`
	Filled    bool              `json:"filled"`
	Results   []FillFieldResult `json:"results"`
	PageActionMeta
}

// ReloadPageRequest is the payload for POST /api/v1/browsers/pages/:id/reload.
type ReloadPageRequest struct {
	BrowserID string `json:"browserId"`
	Snapshot  string `json:"snapshot,omitempty"`
}

// ReloadPageResponse is the response from POST /api/v1/browsers/pages/:id/reload.
type ReloadPageResponse struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId"`
	Reloaded  bool   `json:"reloaded"`
	PageActionMeta
}

// PageScrollInfoResponse is the response from GET /api/v1/browsers/pages/:id/scroll.
type PageScrollInfoResponse struct {
	BrowserID string  `json:"browserId"`
	PageID    string  `json:"pageId"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	MaxX      float64 `json:"maxX"`
	MaxY      float64 `json:"maxY"`
}

// ScrollPageRequest is the payload for POST /api/v1/browsers/pages/:id/scroll.
type ScrollPageRequest struct {
	BrowserID string  `json:"browserId"`
	Left      float64 `json:"left,omitempty"`
	Top       float64 `json:"top,omitempty"`
	Snapshot  string  `json:"snapshot,omitempty"`
}

// ScrollPageResponse is the response from POST /api/v1/browsers/pages/:id/scroll.
type ScrollPageResponse struct {
	BrowserID string  `json:"browserId"`
	PageID    string  `json:"pageId"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	PageActionMeta
}

// ScreenshotPageRequest is the payload for POST /api/v1/browsers/pages/:id/screenshot.
type ScreenshotPageRequest struct {
	BrowserID string `json:"browserId"`
}

// ScreenshotPageResponse is the response from POST /api/v1/browsers/pages/:id/screenshot.
type ScreenshotPageResponse struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId"`
	Path      string `json:"path"`
}

// WaitPageRequest is the payload for POST /api/v1/browsers/pages/:id/wait.
type WaitPageRequest struct {
	BrowserID string `json:"browserId"`
	URL       string `json:"url,omitempty"`
	Text      string `json:"text,omitempty"`
	Load      string `json:"load,omitempty"`
	Timeout   int    `json:"timeout,omitempty"`
	Snapshot  string `json:"snapshot,omitempty"`
}

// WaitPageResponse is the response from POST /api/v1/browsers/pages/:id/wait.
type WaitPageResponse struct {
	BrowserID string `json:"browserId"`
	PageID    string `json:"pageId"`
	Waited    bool   `json:"waited"`
	ElapsedMs int64  `json:"elapsedMs"`
	PageActionMeta
}
