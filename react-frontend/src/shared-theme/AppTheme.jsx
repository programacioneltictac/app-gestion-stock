import * as React from 'react';
import PropTypes from 'prop-types';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { gray, brand } from './themePrimitives';

const defaultTheme = createTheme();

function AppTheme({ children, themeComponents, ...props }) {
  const theme = React.useMemo(() => {
    return createTheme({
      cssVariables: {
        colorSchemeSelector: 'data-mui-color-scheme',
        cssVarPrefix: 'template',
      },
      colorSchemes: {
        light: {
          palette: {
            primary: {
              main: brand[500],
              light: brand[300],
              dark: brand[700],
              contrastText: '#fff',
            },
            grey: gray,
            background: {
              default: '#fff',
              paper: gray[50],
            },
            divider: gray[200],
            text: {
              primary: gray[900],
              secondary: gray[700],
            },
            action: {
              selected: `rgba(${brand[500]}, 0.08)`,
              hover: `rgba(${brand[500]}, 0.04)`,
            },
          },
        },
        dark: {
          palette: {
            primary: {
              main: brand[400],
              light: brand[300],
              dark: brand[600],
              contrastText: '#fff',
            },
            grey: gray,
            background: {
              default: gray[900],
              paper: gray[800],
            },
            divider: gray[700],
            text: {
              primary: '#fff',
              secondary: gray[400],
            },
            action: {
              selected: `rgba(${brand[400]}, 0.12)`,
              hover: `rgba(${brand[400]}, 0.08)`,
            },
          },
        },
      },
      typography: {
        fontFamily: [
          '"Inter", "sans-serif"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
        ].join(','),
        h1: {
          fontSize: defaultTheme.typography.pxToRem(48),
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: -0.5,
        },
        h2: {
          fontSize: defaultTheme.typography.pxToRem(36),
          fontWeight: 600,
          lineHeight: 1.2,
        },
        h3: {
          fontSize: defaultTheme.typography.pxToRem(30),
          lineHeight: 1.2,
        },
        h4: {
          fontSize: defaultTheme.typography.pxToRem(24),
          fontWeight: 600,
          lineHeight: 1.5,
        },
        h5: {
          fontSize: defaultTheme.typography.pxToRem(20),
          fontWeight: 600,
        },
        h6: {
          fontSize: defaultTheme.typography.pxToRem(18),
          fontWeight: 600,
        },
        subtitle1: {
          fontSize: defaultTheme.typography.pxToRem(18),
        },
        subtitle2: {
          fontSize: defaultTheme.typography.pxToRem(16),
        },
        body1: {
          fontSize: defaultTheme.typography.pxToRem(14),
          fontWeight: 400,
        },
        body2: {
          fontSize: defaultTheme.typography.pxToRem(14),
          fontWeight: 400,
        },
        caption: {
          fontSize: defaultTheme.typography.pxToRem(12),
          fontWeight: 400,
        },
      },
      shape: {
        borderRadius: 8,
      },
      components: {
        ...themeComponents,
      },
    });
  }, [themeComponents]);

  return (
    <ThemeProvider theme={theme} {...props}>
      {children}
    </ThemeProvider>
  );
}

AppTheme.propTypes = {
  children: PropTypes.node,
  themeComponents: PropTypes.object,
};

export default AppTheme;
