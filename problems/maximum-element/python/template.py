from typing import List

class Solution:
    def findMax(self, nums: List[int]) -> int:
        max_val = nums[0]
        for num in nums[1:]:
            if num > max_val:
                max_val = num
        return max_val
