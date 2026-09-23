
import { Text as DefaultText, View as DefaultView } from 'react-native';

import Colors from '@/constants/Colors';

type ThemeProps = {
  lightColor?: string;
};

export type TextProps = ThemeProps & DefaultText['props'];
export type ViewProps = ThemeProps & DefaultView['props'];

function useThemeColor(props: { light?: string }, colorName: keyof typeof Colors) {
  return props.light ?? Colors[colorName];
}

export function Text(props: TextProps) {
  const { style, lightColor, ...otherProps } = props;
  const color = useThemeColor({ light: lightColor }, 'text');

  return <DefaultText style={[{ color }, style]} {...otherProps} />;
}

export function View(props: ViewProps) {
  const { style, lightColor, ...otherProps } = props;
  const backgroundColor = useThemeColor({ light: lightColor }, 'background');

  return <DefaultView style={[{ backgroundColor }, style]} {...otherProps} />;
}
