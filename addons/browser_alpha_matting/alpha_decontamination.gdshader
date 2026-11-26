shader_type canvas_item;

// Unmixes observed composite RGB C = alpha * F + (1.0 - alpha) * B
// across semi-transparent cutout boundaries to eliminate premultiplied dark/white edge halos.
uniform vec3 estimated_background : source_color = vec3(1.0, 1.0, 1.0);
uniform float alpha_floor : hint_range(0.02, 0.25, 0.01) = 0.05;
uniform float feather_low : hint_range(0.0, 0.5, 0.01) = 0.02;
uniform float feather_high : hint_range(0.5, 1.0, 0.01) = 0.98;

void fragment() {
	vec4 tex = texture(TEXTURE, UV);
	float a = smoothstep(feather_low, feather_high, tex.a);
	if (a <= 0.001) {
		COLOR = vec4(0.0, 0.0, 0.0, 0.0);
	} else if (a >= 0.999) {
		COLOR = vec4(tex.rgb, 1.0);
	} else {
		float safe_a = max(a, alpha_floor);
		vec3 fg = clamp((tex.rgb - (1.0 - a) * estimated_background) / safe_a, vec3(0.0), vec3(1.0));
		COLOR = vec4(fg, a);
	}
}
