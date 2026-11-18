import { useState } from "react";
import Box from "@mui/material/Box";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

export type BrowserSummary = {
  id: string;
  ownerId: string;
  lastUsed: number;
  pageIds: string[];
};

export type PageSummary = {
  pageId: string;
  url: string;
};

type AppBarProps = {
  browsers: BrowserSummary[];
  currentBrowser?: string;
  pages: PageSummary[];
  currentPage?: string;
  connected: boolean;
  onSelectBrowser: (browserId: string) => void;
  onCreateBrowser: () => void;
  onSelectPage: (pageId: string) => void;
  onCreatePage: () => void;
  onClosePage: (pageId: string) => void;
  onUpdatePageUrl: (pageId: string, url: string) => Promise<void>;
};

function formatTabLabel(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname || rawUrl;
  } catch {
    return rawUrl || "New Tab";
  }
}

function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function AppBar({
  browsers,
  currentBrowser,
  pages,
  currentPage,
  connected,
  onSelectBrowser,
  onCreateBrowser,
  onSelectPage,
  onCreatePage,
  onClosePage,
  onUpdatePageUrl,
}: AppBarProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState("");

  const startEditing = (page: PageSummary) => {
    setEditingPageId(page.pageId);
    setDraftUrl(page.url);
  };

  const cancelEditing = () => {
    setEditingPageId(null);
    setDraftUrl("");
  };

  const commitEditing = async (pageId: string) => {
    const nextUrl = normalizeUrl(draftUrl);
    setEditingPageId(null);
    if (nextUrl) {
      await onUpdatePageUrl(pageId, nextUrl);
    }
  };

  return (
    <Box
      component="header"
      sx={{
        flexShrink: 0,
        height: 38,
        bgcolor: "#0e0e16",
        borderBottom: "1px solid #222230",
        display: "flex",
        alignItems: "center",
        px: 1,
        gap: 0.75,
        userSelect: "none",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {/* Browser selector pill */}
      <Box
        component="button"
        type="button"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          height: 26,
          px: 1.25,
          borderRadius: "999px",
          bgcolor: "#161622",
          border: "1px solid #222230",
          color: "#d4d4e0",
          fontSize: "0.75rem",
          fontWeight: 500,
          cursor: "pointer",
          flexShrink: 0,
          "&:hover": {
            bgcolor: "#1c1c2b",
            borderColor: "#2e2e42",
          },
        }}
      >
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            bgcolor: connected ? "#22c55e" : "#525266",
            flexShrink: 0,
          }}
        />
        <span>{currentBrowser ? currentBrowser.slice(0, 8) : "No browser"}</span>
        <Box component="span" sx={{ color: "#6b6b80", fontSize: "0.65rem" }}>
          ▾
        </Box>
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              bgcolor: "#161622",
              border: "1px solid #222230",
              color: "#d4d4e0",
              minWidth: 180,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            },
          },
        }}
      >
        {browsers.length === 0 ? (
          <MenuItem disabled sx={{ fontSize: "0.75rem", color: "#6b6b80" }}>
            No browsers
          </MenuItem>
        ) : (
          browsers.map((browser) => (
            <MenuItem
              key={browser.id}
              selected={browser.id === currentBrowser}
              onClick={() => {
                onSelectBrowser(browser.id);
                setAnchorEl(null);
              }}
              sx={{
                fontSize: "0.75rem",
                py: 0.75,
                display: "flex",
                justifyContent: "space-between",
                gap: 2,
                "&.Mui-selected": {
                  bgcolor: "#1f1f2e",
                  color: "#f0f0f5",
                },
                "&:hover": {
                  bgcolor: "#1c1c2b",
                },
              }}
            >
              <span>{browser.id.slice(0, 8)}</span>
              <Box component="span" sx={{ color: "#6b6b80", fontSize: "0.7rem" }}>
                {browser.pageIds.length}p
              </Box>
            </MenuItem>
          ))
        )}
      </Menu>

      {/* New browser button */}
      <Box
        component="button"
        type="button"
        title="New browser"
        onClick={onCreateBrowser}
        sx={{
          width: 26,
          height: 26,
          borderRadius: "6px",
          bgcolor: "#161622",
          border: "1px solid #222230",
          color: "#9696ab",
          fontSize: "0.95rem",
          lineHeight: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
          "&:hover": {
            bgcolor: "#1c1c2b",
            color: "#f0f0f5",
          },
        }}
      >
        +
      </Box>

      {/* Divider */}
      <Box sx={{ width: "1px", height: 18, bgcolor: "#222230", mx: 0.25, flexShrink: 0 }} />

      {/* Pages tab strip */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          overflowX: "auto",
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
        }}
      >
        {pages.map((page) => {
          const isActive = page.pageId === currentPage;
          const isEditing = editingPageId === page.pageId;

          if (isEditing) {
            return (
              <Box
                key={page.pageId}
                component="input"
                autoFocus
                value={draftUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDraftUrl(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void commitEditing(page.pageId);
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEditing();
                  }
                }}
                onBlur={cancelEditing}
                sx={{
                  height: 26,
                  minWidth: 220,
                  maxWidth: 360,
                  px: 1.25,
                  borderRadius: "6px",
                  bgcolor: "#1b1b26",
                  border: "1px solid #3b3b54",
                  color: "#f0f0f5",
                  fontSize: "0.75rem",
                  fontFamily: "inherit",
                  outline: "none",
                  flexShrink: 0,
                }}
              />
            );
          }

          return (
            <Box
              key={page.pageId}
              onClick={() => {
                if (isActive) {
                  startEditing(page);
                } else {
                  onSelectPage(page.pageId);
                }
              }}
              onDoubleClick={() => startEditing(page)}
              title={page.url}
              sx={{
                height: 26,
                px: 1.25,
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                gap: 0.75,
                cursor: "pointer",
                flexShrink: 0,
                fontSize: "0.75rem",
                fontWeight: isActive ? 500 : 400,
                bgcolor: isActive ? "#1b1b26" : "transparent",
                border: isActive ? "1px solid #2b2b3d" : "1px solid transparent",
                color: isActive ? "#f0f0f5" : "#9696ab",
                "&:hover": {
                  bgcolor: isActive ? "#1b1b26" : "#161622",
                  color: isActive ? "#f0f0f5" : "#c8c8d8",
                },
              }}
            >
              <Box
                component="span"
                sx={{
                  maxWidth: 200,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {formatTabLabel(page.url)}
              </Box>
              <Box
                component="button"
                type="button"
                aria-label="Close tab"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onClosePage(page.pageId);
                }}
                sx={{
                  p: 0,
                  width: 14,
                  height: 14,
                  border: "none",
                  background: "transparent",
                  color: "#6b6b80",
                  fontSize: "0.85rem",
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  borderRadius: "3px",
                  "&:hover": {
                    color: "#f0f0f5",
                    bgcolor: "rgba(255,255,255,0.08)",
                  },
                }}
              >
                ×
              </Box>
            </Box>
          );
        })}

        {/* New page button */}
        <Box
          component="button"
          type="button"
          title="New tab"
          disabled={!currentBrowser}
          onClick={onCreatePage}
          sx={{
            width: 26,
            height: 26,
            borderRadius: "6px",
            border: "none",
            bgcolor: "transparent",
            color: "#9696ab",
            fontSize: "0.95rem",
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: currentBrowser ? "pointer" : "default",
            opacity: currentBrowser ? 1 : 0.4,
            flexShrink: 0,
            "&:hover": currentBrowser
              ? {
                  bgcolor: "#161622",
                  color: "#f0f0f5",
                }
              : undefined,
          }}
        >
          +
        </Box>
      </Box>
    </Box>
  );
}
