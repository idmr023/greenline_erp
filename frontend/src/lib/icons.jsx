import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faPen,
  faTrash,
  faArrowLeft,
  faArrowRight,
  faArrowUp,
  faArrowDown,
  faFloppyDisk,
  faUpload,
  faDownload,
  faFileLines,
  faFilePen,
  faFileSignature,
  faEye,
  faEyeSlash,
  faGripVertical,
  faXmark,
  faTriangleExclamation,
  faCircleExclamation,
  faCircleCheck,
  faCheck,
  faImage,
  faImages,
  faBox,
  faChartLine,
  faMicrochip,
  faMemory,
  faHeartPulse,
  faStopwatch,
  faRotate,
  faSpinner,
  faShieldHalved,
  faGauge,
  faPalette,
  faQuoteLeft,
  faCartShopping,
  faRightFromBracket,
  faRightToBracket,
  faLock,
  faEnvelope,
  faLocationDot,
  faGift,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faPhone,
  faStar,
  faFont,
  faTable,
  faColumns,
  faHeading,
  faList,
  faListOl,
  faLink,
  faBold,
  faItalic,
  faUnderline,
  faMinus,
  faThLarge,
  faMagnifyingGlass,
  faHardHat,
  faWrench,
  faTruck,
  faAward,
  faBolt,
  faBatteryHalf,
  faRoute,
  faPlay,
  faGraduationCap,
  faPercent,
  faRotateLeft,
  faStore,
  faCreditCard,
  faArrowUpRightFromSquare,
  faBars,
  faScaleBalanced,
  faUser,
  faWallet,
  faUsers,
  faClock,
  faLocationArrow,
  faCommentDots,
  faBuilding,
  faSquare,
  faGear,
  faVolumeHigh,
  faTowerBroadcast,
  faRecycle,
  faTicket,
  faWheelchair,
  faArrowRightArrowLeft,
  faSort,
  faLeftRight,
  faBookOpen,
  faCircleQuestion,
  faHouse,
  faTag,
  faWeightHanging,
  faPlug,
  faWandMagicSparkles,
  faRuler,
  faSliders,
  faBook,
  faHammer,
  faBriefcase,
  faHeart,
  faBullseye,
  faLeaf,
  faCopy,
  faCalculator,
  faDollarSign,
  faNewspaper,
  faCalendar,
  faShareNodes,
  faAngleLeft, 
  faAngleRight,
  faHelmetSafety,
  faShield,
  faFolderOpen,
  faLightbulb,
} from '@fortawesome/free-solid-svg-icons';

import { faInstagram, faTiktok } from '@fortawesome/free-brands-svg-icons';
import { faStar as faStarOutline } from '@fortawesome/free-regular-svg-icons';

export default function Icon({ icon, size = 24, className, color, ...rest }) {
  return (
    <FontAwesomeIcon
      icon={icon}
      width={size}
      height={size}
      color={color}
      className={className}
      {...rest}
    />
  );
}

export const Lightbulb = (props) => <Icon icon={faLightbulb} {...props} />; 
export const FolderOpen = (props) => <Icon icon={faFolderOpen} {...props} />;
export const Shield_ = (props) => <Icon icon={faShield} {...props} />;
export const HelmetSafety = (props) => <Icon icon={faHelmetSafety} {...props} />;
export const Instagram = (props) => <Icon icon={faInstagram} {...props} />;
export const AngleLeft = (props) => <Icon icon={faAngleLeft} {...props} />;
export const AngleRight = (props) => <Icon icon={faAngleRight} {...props} />;
export const TikTok = (props) => <Icon icon={faTiktok} {...props} />;
export const Accessibility = (props) => <Icon icon={faWheelchair} {...props} />;
export const Activity = (props) => <Icon icon={faHeartPulse} {...props} />;
export const AlertCircle = (props) => <Icon icon={faCircleExclamation} {...props} />;
export const AlertTriangle = (props) => <Icon icon={faTriangleExclamation} {...props} />;
export const ArrowDown = (props) => <Icon icon={faArrowDown} {...props} />;
export const ArrowLeft = (props) => <Icon icon={faArrowLeft} {...props} />;
export const ArrowLeftRight = (props) => <Icon icon={faArrowRightArrowLeft} {...props} />;
export const ArrowRight = (props) => <Icon icon={faArrowRight} {...props} />;
export const ArrowUp = (props) => <Icon icon={faArrowUp} {...props} />;
export const ArrowUpDown = (props) => <Icon icon={faSort} {...props} />;
export const Award = (props) => <Icon icon={faAward} {...props} />;
export const BadgeCheck = (props) => <Icon icon={faCircleCheck} {...props} />;
export const Battery = (props) => <Icon icon={faBatteryHalf} {...props} />;
export const BatteryCharging = (props) => <Icon icon={faBolt} {...props} />;
export const Bold = (props) => <Icon icon={faBold} {...props} />;
export const Book = (props) => <Icon icon={faBook} {...props} />;
export const BookOpen = (props) => <Icon icon={faBookOpen} {...props} />;
export const BookOpenCheck = (props) => <Icon icon={faBookOpen} {...props} />;
export const Briefcase = (props) => <Icon icon={faBriefcase} {...props} />;
export const Building2 = (props) => <Icon icon={faBuilding} {...props} />;
export const Calculator = (props) => <Icon icon={faCalculator} {...props} />;
export const Calendar = (props) => <Icon icon={faCalendar} {...props} />;
export const Check = (props) => <Icon icon={faCheck} {...props} />;
export const CheckCircle2 = (props) => <Icon icon={faCircleCheck} {...props} />;
export const ChevronDown = (props) => <Icon icon={faChevronDown} {...props} />;
export const ChevronLeft = (props) => <Icon icon={faChevronLeft} {...props} />;
export const ChevronRight = (props) => <Icon icon={faChevronRight} {...props} />;
export const ChevronUp = (props) => <Icon icon={faChevronUp} {...props} />;
export const CircleDollarSign = (props) => <Icon icon={faDollarSign} {...props} />;
export const Clock = (props) => <Icon icon={faClock} {...props} />;
export const Columns2 = (props) => <Icon icon={faColumns} {...props} />;
export const Construction = (props) => <Icon icon={faHammer} {...props} />;
export const Copy = (props) => <Icon icon={faCopy} {...props} />;
export const Cpu = (props) => <Icon icon={faMicrochip} {...props} />;
export const CreditCard = (props) => <Icon icon={faCreditCard} {...props} />;
export const DollarSign = (props) => <Icon icon={faDollarSign} {...props} />;
export const Download = (props) => <Icon icon={faDownload} {...props} />;
export const ExternalLink = (props) => <Icon icon={faArrowUpRightFromSquare} {...props} />;
export const Eye = (props) => <Icon icon={faEye} {...props} />;
export const EyeOff = (props) => <Icon icon={faEyeSlash} {...props} />;
export const FileCog = (props) => <Icon icon={faFilePen} {...props} />;
export const FileSignature = (props) => <Icon icon={faFileSignature} {...props} />;
export const FileText = (props) => <Icon icon={faFileLines} {...props} />;
export const Gauge = (props) => <Icon icon={faGauge} {...props} />;
export const Gift = (props) => <Icon icon={faGift} {...props} />;
export const GraduationCap = (props) => <Icon icon={faGraduationCap} {...props} />;
export const GripVertical = (props) => <Icon icon={faGripVertical} {...props} />;
export const HardHat = (props) => <Icon icon={faHardHat} {...props} />;
export const Heading = (props) => <Icon icon={faHeading} {...props} />;
export const Heading2 = (props) => <Icon icon={faHeading} {...props} />;
export const Heading3 = (props) => <Icon icon={faHeading} {...props} />;
export const Heart = (props) => <Icon icon={faHeart} {...props} />;
export const HelpCircle = (props) => <Icon icon={faCircleQuestion} {...props} />;
export const Home = (props) => <Icon icon={faHouse} {...props} />;
export const Image = (props) => <Icon icon={faImage} {...props} />;
export const ImageIcon = (props) => <Icon icon={faImage} {...props} />;
export const Images = (props) => <Icon icon={faImages} {...props} />;
export const ImagesIcon = (props) => <Icon icon={faImages} {...props} />;
export const Italic = (props) => <Icon icon={faItalic} {...props} />;
export const LayoutDashboard = (props) => <Icon icon={faGauge} {...props} />;
export const LayoutGrid = (props) => <Icon icon={faThLarge} {...props} />;
export const Leaf = (props) => <Icon icon={faLeaf} {...props} />;
export const Link = (props) => <Icon icon={faLink} {...props} />;
export const LinkIcon = (props) => <Icon icon={faLink} {...props} />;
export const List = (props) => <Icon icon={faList} {...props} />;
export const ListOrdered = (props) => <Icon icon={faListOl} {...props} />;
export const Loader2 = (props) => <Icon icon={faSpinner} {...props} />;
export const Lock = (props) => <Icon icon={faLock} {...props} />;
export const LogIn = (props) => <Icon icon={faRightToBracket} {...props} />;
export const LogOut = (props) => <Icon icon={faRightFromBracket} {...props} />;
export const Mail = (props) => <Icon icon={faEnvelope} {...props} />;
export const MapPin = (props) => <Icon icon={faLocationDot} {...props} />;
export const MapPinned = (props) => <Icon icon={faLocationDot} {...props} />;
export const MemoryStick = (props) => <Icon icon={faMemory} {...props} />;
export const Menu = (props) => <Icon icon={faBars} {...props} />;
export const MessageCircle = (props) => <Icon icon={faCommentDots} {...props} />;
export const MessageSquareHeart = (props) => <Icon icon={faCommentDots} {...props} />;
export const MessageSquareQuote = (props) => <Icon icon={faQuoteLeft} {...props} />;
export const Minus = (props) => <Icon icon={faMinus} {...props} />;
export const MoveHorizontal = (props) => <Icon icon={faLeftRight} {...props} />;
export const Navigation = (props) => <Icon icon={faLocationArrow} {...props} />;
export const Newspaper = (props) => <Icon icon={faNewspaper} {...props} />;
export const Package = (props) => <Icon icon={faBox} {...props} />;
export const Palette = (props) => <Icon icon={faPalette} {...props} />;
export const Pencil = (props) => <Icon icon={faPen} {...props} />;
export const Percent = (props) => <Icon icon={faPercent} {...props} />;
export const Phone = (props) => <Icon icon={faPhone} {...props} />;
export const Play = (props) => <Icon icon={faPlay} {...props} />;
export const Plus = (props) => <Icon icon={faPlus} {...props} />;
export const Quote = (props) => <Icon icon={faQuoteLeft} {...props} />;
export const Radio = (props) => <Icon icon={faTowerBroadcast} {...props} />;
export const Recycle = (props) => <Icon icon={faRecycle} {...props} />;
export const RefreshCw = (props) => <Icon icon={faRotate} {...props} />;
export const RotateCcw = (props) => <Icon icon={faRotateLeft} {...props} />;
export const Route = (props) => <Icon icon={faRoute} {...props} />;
export const Ruler = (props) => <Icon icon={faRuler} {...props} />;
export const Save = (props) => <Icon icon={faFloppyDisk} {...props} />;
export const Scale = (props) => <Icon icon={faScaleBalanced} {...props} />;
export const Search = (props) => <Icon icon={faMagnifyingGlass} {...props} />;
export const Settings = (props) => <Icon icon={faGear} {...props} />;
export const Settings2 = (props) => <Icon icon={faGear} {...props} />;
export const Share2 = (props) => <Icon icon={faShareNodes} {...props} />;
export const Shield = (props) => <Icon icon={faShieldHalved} {...props} />;
export const ShieldAlert = (props) => <Icon icon={faTriangleExclamation} {...props} />;
export const ShieldCheck = (props) => <Icon icon={faShieldHalved} {...props} />;
export const ShieldOff = (props) => <Icon icon={faShieldHalved} {...props} />;
export const ShoppingCart = (props) => <Icon icon={faCartShopping} {...props} />;
export const SlidersHorizontal = (props) => <Icon icon={faSliders} {...props} />;
export const Sparkles = (props) => <Icon icon={faWandMagicSparkles} {...props} />;
export const Square = (props) => <Icon icon={faSquare} {...props} />;
export const Star = (props) => <Icon icon={faStar} {...props} />;
export const StarOutline = (props) => <Icon icon={faStarOutline} {...props} />;
export const Store = (props) => <Icon icon={faStore} {...props} />;
export const Table = (props) => <Icon icon={faTable} {...props} />;
export const TableIcon = (props) => <Icon icon={faTable} {...props} />;
export const Tag = (props) => <Icon icon={faTag} {...props} />;
export const Target = (props) => <Icon icon={faBullseye} {...props} />;
export const TicketPercent = (props) => <Icon icon={faTicket} {...props} />;
export const Timer = (props) => <Icon icon={faStopwatch} {...props} />;
export const Trash2 = (props) => <Icon icon={faTrash} {...props} />;
export const TrendingUp = (props) => <Icon icon={faChartLine} {...props} />;
export const Truck = (props) => <Icon icon={faTruck} {...props} />;
export const Type = (props) => <Icon icon={faFont} {...props} />;
export const UnderlineIcon = (props) => <Icon icon={faUnderline} {...props} />;
export const Underline = (props) => <Icon icon={faUnderline} {...props} />;
export const Unplug = (props) => <Icon icon={faPlug} {...props} />;
export const Upload = (props) => <Icon icon={faUpload} {...props} />;
export const User = (props) => <Icon icon={faUser} {...props} />;
export const Users = (props) => <Icon icon={faUsers} {...props} />;
export const Volume2 = (props) => <Icon icon={faVolumeHigh} {...props} />;
export const Wallet = (props) => <Icon icon={faWallet} {...props} />;
export const Weight = (props) => <Icon icon={faWeightHanging} {...props} />;
export const Wrench = (props) => <Icon icon={faWrench} {...props} />;
export const X = (props) => <Icon icon={faXmark} {...props} />;
export const Zap = (props) => <Icon icon={faBolt} {...props} />;