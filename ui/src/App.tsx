import { AppBar } from "./components/AppBar"
import Box from '@mui/material/Box';

function App() {
  return (
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <AppBar />
      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          bgcolor: '#13131b',
        }}>
        <p>Всё начинается с чистой страницы.</p>
      </Box>
    </Box>
  )
}

export default App
