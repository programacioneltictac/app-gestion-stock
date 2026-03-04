import * as React from 'react';
import PropTypes from 'prop-types';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormGroup from '@mui/material/FormGroup';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router';
import { getUserRoles } from '../data/users';
import { getBranchesList } from '../data/branches';

function UserForm(props) {
  const {
    formState,
    onFieldChange,
    onSubmit,
    onReset,
    submitButtonLabel,
    backButtonPath,
    isEditing,
  } = props;

  const formValues = formState.values;
  const formErrors = formState.errors;

  const navigate = useNavigate();

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [branches, setBranches] = React.useState([]);

  const roles = React.useMemo(() => getUserRoles(), []);

  // Load branches
  React.useEffect(() => {
    const loadBranches = async () => {
      try {
        const data = await getBranchesList();
        setBranches(data);
      } catch (error) {
        console.error('Error loading branches:', error);
      }
    };
    loadBranches();
  }, []);

  const handleSubmit = React.useCallback(
    async (event) => {
      event.preventDefault();

      setIsSubmitting(true);
      try {
        await onSubmit(formValues);
      } finally {
        setIsSubmitting(false);
      }
    },
    [formValues, onSubmit]
  );

  const handleTextFieldChange = React.useCallback(
    (event) => {
      onFieldChange(event.target.name, event.target.value);
    },
    [onFieldChange]
  );

  const handleReset = React.useCallback(() => {
    if (onReset) {
      onReset(formValues);
    }
  }, [formValues, onReset]);

  const handleBack = React.useCallback(() => {
    navigate(backButtonPath ?? '/users');
  }, [navigate, backButtonPath]);

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      noValidate
      autoComplete="off"
      onReset={handleReset}
      sx={{ width: '100%' }}
    >
      <FormGroup>
        <Grid container spacing={2} sx={{ mb: 2, width: '100%' }}>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex' }}>
            <TextField
              value={formValues.username ?? ''}
              onChange={handleTextFieldChange}
              name="username"
              label="Usuario"
              error={!!formErrors.username}
              helperText={formErrors.username ?? ' '}
              required
              fullWidth
              disabled={isEditing}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex' }}>
            <TextField
              value={formValues.password ?? ''}
              onChange={handleTextFieldChange}
              name="password"
              label={isEditing ? 'Nueva Contraseña (opcional)' : 'Contraseña'}
              type="password"
              error={!!formErrors.password}
              helperText={formErrors.password ?? ' '}
              required={!isEditing}
              fullWidth
              autoComplete="new-password"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex' }}>
            <Autocomplete
              fullWidth
              value={roles.find((r) => r.id === formValues.role) || null}
              onChange={(event, newValue) => {
                handleTextFieldChange({ target: { name: 'role', value: newValue?.id || '' } });
              }}
              options={roles}
              getOptionLabel={(option) => option.name || ''}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Rol"
                  required
                  error={!!formErrors.role}
                  helperText={formErrors.role ?? ' '}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }} sx={{ display: 'flex' }}>
            <Autocomplete
              fullWidth
              value={branches.find((b) => b.id === formValues.branchId) || null}
              onChange={(event, newValue) => {
                handleTextFieldChange({ target: { name: 'branchId', value: newValue?.id || '' } });
              }}
              options={branches}
              getOptionLabel={(option) => option.name || ''}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Sucursal (opcional)"
                  error={!!formErrors.branchId}
                  helperText={formErrors.branchId ?? ' '}
                />
              )}
            />
          </Grid>
        </Grid>
      </FormGroup>
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Button
          variant="contained"
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
        >
          Volver
        </Button>
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={isSubmitting}
        >
          {submitButtonLabel}
        </Button>
      </Stack>
    </Box>
  );
}

UserForm.propTypes = {
  backButtonPath: PropTypes.string,
  formState: PropTypes.shape({
    errors: PropTypes.object.isRequired,
    values: PropTypes.object.isRequired,
  }).isRequired,
  onFieldChange: PropTypes.func.isRequired,
  onReset: PropTypes.func,
  onSubmit: PropTypes.func.isRequired,
  submitButtonLabel: PropTypes.string.isRequired,
  isEditing: PropTypes.bool,
};

export default UserForm;
