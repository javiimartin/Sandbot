from enum import Enum


class RobotEmotion(str, Enum):
    NORMAL = "NORMAL"
    SMILE = "SMILE"
    LAUGHTER = "LAUGHTER"
    SURPRISE = "SURPRISE"
    QUESTION = "QUESTION"
    SHY = "SHY"
    ANGRY = "ANGRY"
    CRY = "CRY"