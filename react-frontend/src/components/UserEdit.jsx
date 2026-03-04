import * as React from 'react';
import { useParams, useNavigate } from 'react-router';
import useNotifications from '../hooks/useNotifications/useNotifications';
import { getUser, updateUser, validate as validateUser } from '../data/users';
import UserForm from './UserForm';
import PageContainer from './PageContainer';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

export default function UserEdit() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const notifications = useNotifications();

  const [formState, setFormState] = React.useState(() => ({
    values: {
      username: '',
      password: '',
      role: '',
      branchId: '',
    },
    errors: {},
  }));

  const [isLoading, setIsLoading] = React.useState(true);

  const formValues = formState.values;
  const formErrors = formState.errors;

  // Load user data
  React.useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await getUser(userId);
        setFormState({
          values: {
            username: user.username,
            password: '', // Don't load password
            role: user.role,
            branchId: user.branchId || '',
          },
          errors: {},
        });
      } catch (error) {
        notifications.show(`Error al cargar usuario: ${error.message}`, {
          severity: 'error',
          autoHideDuration: 3000,
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
  }, [userId, notifications]);

  const setFormValues = React.useCallback((newFormValues) => {
    setFormState((previousState) => ({
      ...previousState,
      values: newFormValues,
    }));
  }, []);

  const setFormErrors = React.useCallback((newFormErrors) => {
    setFormState((previousState) => ({
      ...previousState,
      errors: newFormErrors,
    }));
  }, []);

  const handleFormFieldChange = React.useCallback(
    (name, value) => {
      const validateField = (values) => {
        // For editing, password is optional
        const valuesToValidate = { ...values };
        if (!valuesToValidate.password) {
          delete valuesToValidate.password;
        }
        const { errors } = validateUser(valuesToValidate);
        setFormErrors({
          ...formErrors,
          [name]: errors[name],
        });
      };

      const newFormValues = { ...formValues, [name]: value };

      setFormValues(newFormValues);
      validateField(newFormValues);
    },
    [formValues, formErrors, setFormErrors, setFormValues]
  );

  const handleFormSubmit = React.useCallback(async () => {
    // For editing, password is optional
    const valuesToValidate = { ...formValues };
    if (!valuesToValidate.password) {
      delete valuesToValidate.password;
    }

    const { valid, errors } = validateUser(valuesToValidate);
    if (!valid) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    try {
      // Only send password if it was changed
      const updateData = { ...formValues };
      if (!updateData.password) {
        delete updateData.password;
      }

      await updateUser(userId, updateData);
      notifications.show('Usuario actualizado exitosamente', {
        severity: 'success',
        autoHideDuration: 3000,
      });

      navigate('/users');
    } catch (updateError) {
      notifications.show(`Error al actualizar usuario: ${updateError.message}`, {
        severity: 'error',
        autoHideDuration: 3000,
      });
      throw updateError;
    }
  }, [formValues, userId, navigate, notifications, setFormErrors]);

  if (isLoading) {
    return (
      <PageContainer title="Editar Usuario">
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="Editar Usuario"
      breadcrumbs={[
        { title: 'Usuarios', href: '/users' },
        { title: formValues.username },
        { title: 'Editar' },
      ]}
    >
      <UserForm
        formState={formState}
        onFieldChange={handleFormFieldChange}
        onSubmit={handleFormSubmit}
        submitButtonLabel="Actualizar"
        isEditing={true}
      />
    </PageContainer>
  );
}
