import * as React from "react";
import PropTypes from "prop-types";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { useNavigate, useParams } from "react-router";
import useNotifications from "../hooks/useNotifications/useNotifications";
import {
  getOne as getProduct,
  updateOne as updateProduct,
  validate as validateProduct,
} from "../data/products";
import ProductForm from "./ProductForm";
import PageContainer from "./PageContainer";

function ProductEditForm({ initialValues, onSubmit }) {
  const { productId } = useParams();
  const navigate = useNavigate();

  const notifications = useNotifications();

  const [formState, setFormState] = React.useState(() => ({
    values: initialValues,
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
    setFormValues(initialValues);
  }, [initialValues, setFormValues]);

  const handleFormSubmit = React.useCallback(async () => {
    const { valid, errors } = validateProduct(formValues);
    if (!valid) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    try {
      await onSubmit(formValues);
      notifications.show("Product edited successfully.", {
        severity: "success",
        autoHideDuration: 3000,
      });

      navigate("/products");
    } catch (editError) {
      notifications.show(
        `Failed to edit product. Reason: ${editError.message}`,
        {
          severity: "error",
          autoHideDuration: 3000,
        }
      );
      throw editError;
    }
  }, [formValues, navigate, notifications, onSubmit, setFormErrors]);

  return (
    <ProductForm
      formState={formState}
      onFieldChange={handleFormFieldChange}
      onSubmit={handleFormSubmit}
      onReset={handleFormReset}
      submitButtonLabel="Save"
      backButtonPath={`/products/${productId}`}
    />
  );
}

ProductEditForm.propTypes = {
  initialValues: PropTypes.shape({
    name: PropTypes.string,
    code: PropTypes.string,
    description: PropTypes.string,
  }).isRequired,
  onSubmit: PropTypes.func.isRequired,
};

export default function ProductEdit() {
  const { productId } = useParams();

  const [product, setProduct] = React.useState(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const loadData = React.useCallback(async () => {
    setError(null);
    setIsLoading(true);

    try {
      const showData = await getProduct(Number(productId));

      setProduct(showData);
    } catch (showDataError) {
      setError(showDataError);
    }
    setIsLoading(false);
  }, [productId]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSubmit = React.useCallback(
    async (formValues) => {
      const updatedData = await updateProduct(Number(productId), formValues);
      setProduct(updatedData);
    },
    [productId]
  );

  const renderEdit = React.useMemo(() => {
    if (isLoading) {
      return (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            m: 1,
          }}
        >
          <CircularProgress />
        </Box>
      );
    }
    if (error) {
      return (
        <Box sx={{ flexGrow: 1 }}>
          <Alert severity="error">{error.message}</Alert>
        </Box>
      );
    }

    return product ? (
      <ProductEditForm initialValues={product} onSubmit={handleSubmit} />
    ) : null;
  }, [isLoading, error, product, handleSubmit]);

  return (
    <PageContainer
      title={`Edit Product ${productId}`}
      breadcrumbs={[
        { title: "Products", path: "/products" },
        { title: `Product ${productId}`, path: `/products/${productId}` },
        { title: "Edit" },
      ]}
    >
      <Box sx={{ display: "flex", flex: 1 }}>{renderEdit}</Box>
    </PageContainer>
  );
}
