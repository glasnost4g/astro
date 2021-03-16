import AwaitBlock from '../AwaitBlock';
import Body from '../Body';
import Comment from '../Comment';
import EachBlock from '../EachBlock';
import Element from '../Element';
import Head from '../Head';
import IfBlock from '../IfBlock';
import InlineComponent from '../InlineComponent';
import KeyBlock from '../KeyBlock';
import MustacheTag from '../MustacheTag';
import Options from '../Options';
import RawMustacheTag from '../RawMustacheTag';
import DebugTag from '../DebugTag';
import SlotTemplate from '../SlotTemplate';
import Text from '../Text';
import Title from '../Title';
import Window from '../Window';
import { TemplateNode } from '../../../interfaces';
export declare type Children = ReturnType<typeof map_children>;
export default function map_children(
  component: any,
  parent: any,
  scope: any,
  children: TemplateNode[]
): (
  | AwaitBlock
  | Body
  | Comment
  | DebugTag
  | EachBlock
  | Element
  | Head
  | IfBlock
  | InlineComponent
  | KeyBlock
  | MustacheTag
  | Options
  | RawMustacheTag
  | SlotTemplate
  | Text
  | Title
  | Window
)[];
