import { image_path } from "../../environment";




interface Image {
  className?: string;
  src: string;
  alt?: string;
  height?: number;
  width?: number;
  id?:string;
}

const ImageWithBasePath = (props: Image) => {
  // If src is already an absolute URL (http/https) or data URI, use it directly
  const isAbsolute = props.src && (props.src.startsWith('http') || props.src.startsWith('data:') || props.src.startsWith('/static'));
  const fullSrc = isAbsolute ? props.src : `${image_path}${props.src}`;
  return (
    <img
      className={props.className}
      src={fullSrc}
      height={props.height}
      alt={props.alt}
      width={props.width}
      id={props.id}
      onError={(e) => {
        // Fallback to generated avatar on broken image
        const name = props.alt || 'User';
        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6c757d&color=fff&size=128`;
      }}
    />
  );
};

export default ImageWithBasePath;
