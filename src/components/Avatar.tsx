type AvatarProps = {
  value: string;
  fallback: string;
};

export function Avatar({ value: rawValue, fallback }: AvatarProps) {
  const value = rawValue.trim();
  const isImage = value.startsWith("data:image/") || value.startsWith("http://") || value.startsWith("https://");

  return <span className="avatar">{isImage ? <img src={value} alt="" /> : value || fallback.slice(0, 2).toUpperCase()}</span>;
}
