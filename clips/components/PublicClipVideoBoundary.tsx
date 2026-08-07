import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { TriangleAlert } from "lucide-react-native";

type Props = {
  posterUri: string;
  children: React.ReactNode;
};

type State = { hasError: boolean };

/**
 * Isolates a single Clip's video player from the rest of the feed. If the
 * native video binding throws (a malformed asset, an unsupported codec, a
 * deleted Cloudinary resource surfaced as a render-time error rather than a
 * status event) this stops the crash from taking down the whole reels list —
 * the broken card falls back to its poster and the user can keep scrolling.
 */
export class PublicClipVideoBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    if (__DEV__) {
      console.warn("[PublicClipVideoBoundary] Clip player crashed, showing fallback:", error);
    }
  }

  componentDidUpdate(previousProps: Props) {
    // A new clip was swapped into this slot (list recycling) — give it a
    // fresh chance to play instead of staying stuck in the fallback state.
    if (previousProps.posterUri !== this.props.posterUri && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={StyleSheet.absoluteFill}>
          {this.props.posterUri
            ? <Image source={{ uri: this.props.posterUri }} resizeMode="cover" style={StyleSheet.absoluteFill} />
            : null}
          <View style={styles.center}>
            <TriangleAlert size={28} color="#FFB0CD" />
            <Text style={styles.title}>This Clip is unavailable</Text>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,7,9,.48)", alignItems: "center", justifyContent: "center", gap: 10 },
  title: { color: "#FFF", fontSize: 14, fontWeight: "800" },
});
