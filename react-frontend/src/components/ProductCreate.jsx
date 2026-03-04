import * as React from "react";
import { useNavigate } from "react-router";
import useNotifications from "../hooks/useNotifications/useNotifications";
import {
  createOne as createProduct,
  validate as validateProduct,
} from "../data/products";
import ProductForm from "./ProductForm";
import PageContainer from "./PageContainer";

const INITIAL_FORM_VALUES = {
  name: "",
  code: "",
  description: "",
  brandId: null,
  categoryId: null,
};

export default function ProductCreate() {
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
        const { errors } = validateProduct(values);
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
    const { valid, errors } = validateProduct(formValues);
    if (!valid) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    try {
      await createProduct(formValues);
      notifications.show("Product created successfully.", {
        severity: "success",
        autoHideDuration: 3000,
      });

      navigate("/products");
    } catch (createError) {
      notifications.show(
        `Failed to create product. Reason: ${createError.message}`,
        {
          severity: "error",
          autoHideDuration: 3000,
        }
      );
      throw createError;
    }
  }, [formValues, navigate, notifications, setFormErrors]);

  return (
    <PageContainer
      title="Nuevo Producto"
      breadcrumbs={[
        { title: "Productos", path: "/products" },
        { title: "Nuevo" },
      ]}
    >
      <ProductForm
        formState={formState}
        onFieldChange={handleFormFieldChange}
        onSubmit={handleFormSubmit}
        onReset={handleFormReset}
        submitButtonLabel="Crear"
      />
    </PageContainer>
  );
}
