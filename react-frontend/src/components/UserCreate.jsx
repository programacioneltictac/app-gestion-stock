import * as React from 'react';
import { useNavigate } from 'react-router';
import useNotifications from '../hooks/useNotifications/useNotifications';
import { createUser, validate as validateUser } from '../data/users';
import UserForm from './UserForm';
import PageContainer from './PageContainer';

const INITIAL_FORM_VALUES = {
  username: '',
  password: '',
  role: '',
  branchId: '',
};

export default function UserCreate() {
  const navigate = useNavigate();
  const notifications = useNotifications();

  const [formState, setFormState] = React.useState(() => ({
    values: INITIAL_FORM_VALUES,
    errors: {},
  }));

  const formValues = formState.values;
  const formErrors = formState.errors;

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
        const { errors } = validateUser(values);
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

  const handleFormReset = React.useCallback(() => {
    setFormValues(INITIAL_FORM_VALUES);
  }, [setFormValues]);

  const handleFormSubmit = React.useCallback(async () => {
    const { valid, errors } = validateUser(formValues);
    if (!valid) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    try {
      await createUser(formValues);
      notifications.show('Usuario creado exitosamente', {
        severity: 'success',
        autoHideDuration: 3000,
      });

      navigate('/users');
    } catch (createError) {
      notifications.show(`Error al crear usuario: ${createError.message}`, {
        severity: 'error',
        autoHideDuration: 3000,
      });
      throw createError;
    }
  }, [formValues, navigate, notifications, setFormErrors]);

  return (
    <PageContainer
      title="Nuevo Usuario"
      breadcrumbs={[
        { title: 'Usuarios', href: '/users' },
        { title: 'Nuevo' },
      ]}
    >
      <UserForm
        formState={formState}
        onFieldChange={handleFormFieldChange}
        onSubmit={handleFormSubmit}
        onReset={handleFormReset}
        submitButtonLabel="Crear"
        isEditing={false}
      />
    </PageContainer>
  );
}
