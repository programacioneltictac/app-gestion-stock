import * as React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useAuth } from '../context/AuthContext';
import PageContainer from './PageContainer';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <PageContainer
      title="Dashboard"
      breadcrumbs={[{ title: 'Dashboard' }]}
    >
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Bienvenido, {user?.name || user?.username}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Sistema de Gestión de Stock
        </Typography>
      </Box>
    </PageContainer>
  );
}
