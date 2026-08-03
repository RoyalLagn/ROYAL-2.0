import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = React.PropsWithChildren<{
  /** Shown above the error message so it's obvious which section failed. */
  label: string;
}>;

type State = { error: Error | null };

/**
 * A small, scoped error boundary for sections of a screen that can fail
 * independently (a data-shaped grid, a media viewer, etc.). Unlike letting
 * an error bubble to the app-wide boundary in app/_layout.tsx — which blanks
 * the entire screen — this only replaces the failing section and prints the
 * real error message on screen. That message is visible in production/APK
 * builds too (not just Metro's dev-only red box), which is the fastest way
 * to see what's actually throwing when a device log isn't available.
 */
export class SectionErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.label}] section failed to render:`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.box}>
          <Text style={styles.title}>{this.props.label} couldn&apos;t load</Text>
          <Text style={styles.message} selectable>
            {this.state.error.message || String(this.state.error)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retry ${this.props.label}`}
            onPress={() => this.setState({ error: null })}
            style={styles.retry}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  box: {
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F0C4D3",
    backgroundColor: "#FFF7FA",
    gap: 8,
  },
  title: { fontSize: 13, fontWeight: "800", color: "#7A1E3C" },
  message: { fontSize: 12, lineHeight: 17, color: "#8A6470" },
  retry: {
    alignSelf: "flex-start",
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    backgroundColor: "#E91E63",
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
});
