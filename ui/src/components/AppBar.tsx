import MuiAppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function AppBar() {
    return (
        <Box sx={{ flexShrink: 0 }}>
            <MuiAppBar position="static" sx={{ bgcolor: '#0e0e16' }}>
                <Typography
                    component="h1"
                    variant="h6"
                    sx={{
                        m: 0,
                        px: 2,
                        py: 2,
                        textAlign: 'center',
                        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        fontSize: { xs: '1.125rem', sm: '1.25rem' },
                        fontWeight: 600,
                        lineHeight: 1.4,
                        letterSpacing: '-0.025em',
                        color: '#9696ab',
                    }}
                >
                    Agentic Browser
                </Typography>
            </MuiAppBar >
        </Box>
    )
}
